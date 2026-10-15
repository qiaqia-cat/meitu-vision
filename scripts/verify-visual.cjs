const path = require('node:path')
const { chromium } = require('playwright')

async function sampleCanvas(page) {
  return page.evaluate(async () => {
    const canvas = document.querySelector('.intro-canvas')
    if (!(canvas instanceof HTMLCanvasElement)) {
      return { found: false, nonDark: 0, width: 0, height: 0 }
    }
    await new Promise((resolve) => setTimeout(resolve, 900))
    const dataUrl = canvas.toDataURL('image/png')
    const image = new Image()
    image.src = dataUrl
    await image.decode()
    const probe = document.createElement('canvas')
    probe.width = 80
    probe.height = 80
    const ctx = probe.getContext('2d')
    ctx.drawImage(image, 0, 0, 80, 80)
    const data = ctx.getImageData(0, 0, 80, 80).data
    let nonDark = 0
    for (let i = 0; i < data.length; i += 4) {
      const light = data[i] + data[i + 1] + data[i + 2]
      if (data[i + 3] > 20 && light > 38) nonDark += 1
    }
    return {
      found: true,
      nonDark,
      width: canvas.clientWidth,
      height: canvas.clientHeight
    }
  })
}

async function runCase(browser, name, viewport) {
  const page = await browser.newPage({ viewport })
  await page.goto(process.env.MEITU_VISION_URL || 'http://localhost:5173/', { waitUntil: 'networkidle' })
  const result = await sampleCanvas(page)
  const screenshotPath = path.join(__dirname, '..', '..', '..', 'outputs', 'meitu-vision', `${name}.png`)
  await page.screenshot({ path: screenshotPath, fullPage: true })
  await page.close()
  if (!result.found || result.nonDark < 280 || result.width < 280 || result.height < 420) {
    throw new Error(`${name} canvas check failed: ${JSON.stringify(result)}`)
  }
  console.log(`${name}: ok ${JSON.stringify(result)}`)
}

async function main() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  const browser = await chromium.launch({ headless: true, executablePath: edgePath })
  try {
    await runCase(browser, 'desktop', { width: 1440, height: 900 })
    await runCase(browser, 'mobile', { width: 390, height: 844 })
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
