/**
 * Linear 워크플로우 상태 아이콘 SVG → 128x128 PNG 변환.
 * 입력: ~/Downloads/linear-state-icons.txt (=== Name === 헤더로 구분)
 * 출력: public/linear-icons/<slug>.png
 */
import fs from "fs";
import path from "path";
import os from "os";
import sharp from "sharp";

const INPUT = path.join(os.homedir(), "Downloads/linear-state-icons.txt");
const OUTPUT_DIR = path.join(process.cwd(), "public/linear-icons");

const SIZE = 128;

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}

function parseSvgs(text: string): Array<{ name: string; svg: string }> {
  const out: Array<{ name: string; svg: string }> = [];
  const re = /=== (.+?) ===\n([\s\S]*?)(?=\n=== |\n*$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out.push({ name: m[1].trim(), svg: m[2].trim() });
  }
  return out;
}

// librsvg가 lch() 미지원 → 브라우저 canvas에서 추출한 hex로 치환
const LCH_TO_HEX: Record<string, string> = {
  "lch(68.75% 3.577 260.65)": "#a4a8ae",
  "lch(68.75% 0 139.088)": "#a8a8a8",
  "lch(80% 90 85)": "#f0bf00",
  "lch(68% 64.37 141.95)": "#43bc58",
  "lch(48% 59.31 288.43)": "#5e6ad2",
};

function scaleSvg(svg: string, size: number): string {
  let out = svg
    .replace(/width="\d+"/, `width="${size}"`)
    .replace(/height="\d+"/, `height="${size}"`);
  for (const [lch, hex] of Object.entries(LCH_TO_HEX)) {
    out = out.split(lch).join(hex);
  }
  // 남은 lch() 있으면 경고 — 대비 안 된 색상 발견 시 가시화
  const remaining = out.match(/lch\([^)]+\)/g);
  if (remaining) console.warn("unmapped lch():", remaining);
  return out;
}

async function main() {
  const text = fs.readFileSync(INPUT, "utf-8");
  const items = parseSvgs(text);
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const { name, svg } of items) {
    const scaled = scaleSvg(svg, SIZE);
    const outFile = path.join(OUTPUT_DIR, `${slugify(name)}.png`);
    await sharp(Buffer.from(scaled))
      .resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(outFile);
    const stat = fs.statSync(outFile);
    console.log(`✓ ${name} → ${outFile} (${stat.size}B)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
