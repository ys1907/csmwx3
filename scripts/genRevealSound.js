// 揭晓音合成器：生成柔和的双音「叮咚」（木琴/钟琴质感）写入 data/sounds.js。
// 旧版 DING 是 8kHz/8bit 单频正弦，又尖又糙；新版 22.05kHz/16bit：
//   D5(587Hz) → A5(880Hz) 上行双音，指数衰减 + 二三次泛音 + tanh 软限幅 + 尾部淡出。
// 调音改下面 NOTES/参数后重跑：node scripts/genRevealSound.js（用 PowerShell 跑保证落真盘）
const fs = require('fs')
const path = require('path')

const SAMPLE_RATE = 22050
const DURATION = 0.55 // 秒
const MASTER_GAIN = 0.8

// f=基频Hz, start=起始秒, amp=响度, decay=衰减时常数秒
const NOTES = [
  { f: 587.33, start: 0, amp: 0.6, decay: 0.16 },  // D5
  { f: 880.0, start: 0.09, amp: 0.5, decay: 0.2 }, // A5
]

function noteSample(n, t) {
  const x = t - n.start
  if (x < 0) return 0
  const attack = Math.min(1, x / 0.004) // 4ms 起音，去爆音
  const fundamental = Math.sin(2 * Math.PI * n.f * x)
  const harm2 = 0.35 * Math.sin(2 * Math.PI * 2 * n.f * x) * Math.exp(-x / 0.07)
  const harm3 = 0.12 * Math.sin(2 * Math.PI * 3.01 * n.f * x) * Math.exp(-x / 0.045)
  return n.amp * attack * Math.exp(-x / n.decay) * (fundamental + harm2 + harm3)
}

const total = Math.round(SAMPLE_RATE * DURATION)
const pcm = Buffer.alloc(total * 2)
for (let i = 0; i < total; i++) {
  const t = i / SAMPLE_RATE
  let s = 0
  for (const n of NOTES) s += noteSample(n, t)
  s = Math.tanh(s * 1.1) * MASTER_GAIN // 软限幅，避免双音叠加削顶
  const fadeStart = DURATION - 0.08 // 尾部 80ms 线性淡出，去咔哒
  if (t > fadeStart) s *= Math.max(0, (DURATION - t) / 0.08)
  pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2)
}

// 16bit 单声道 WAV 头
const header = Buffer.alloc(44)
header.write('RIFF', 0)
header.writeUInt32LE(36 + pcm.length, 4)
header.write('WAVE', 8)
header.write('fmt ', 12)
header.writeUInt32LE(16, 16)          // fmt chunk size
header.writeUInt16LE(1, 20)           // PCM
header.writeUInt16LE(1, 22)           // mono
header.writeUInt32LE(SAMPLE_RATE, 24)
header.writeUInt32LE(SAMPLE_RATE * 2, 28) // byte rate
header.writeUInt16LE(2, 32)           // block align
header.writeUInt16LE(16, 34)          // bits per sample
header.write('data', 36)
header.writeUInt32LE(pcm.length, 40)

const wav = Buffer.concat([header, pcm])
const dataUri = 'data:audio/wav;base64,' + wav.toString('base64')
const out = `const DING_SOUND = '${dataUri}'\nmodule.exports = { DING_SOUND }\n`
fs.writeFileSync(path.join(__dirname, '..', 'data', 'sounds.js'), out)
console.log(`已生成 data/sounds.js：${DURATION}s @ ${SAMPLE_RATE}Hz 16bit，WAV ${(wav.length / 1024).toFixed(1)}KB，base64 ${(dataUri.length / 1024).toFixed(1)}KB`)
