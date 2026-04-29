/**
 * 부모 이슈 아이콘: Linear 워크플로우 6개 상태 색상으로 피자 분할
 * 출력: public/linear-icons/parent.png
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";

const SIZE = 128;
const OUT = path.join(process.cwd(), "public/linear-icons/parent.png");

// 회색 단색 + 3분할. 분할선은 마스크로 빈 배경(투명) 처리해서 일관 두께 유지
// 외곽 두꺼운 테두리 + 그 안쪽에 얇은 링 하나 더
const CX = 7;
const CY = 7;
const R_OUTER = 6;          // 외곽 테두리 반경
const STROKE_OUTER = 1.5;
const STROKE_INNER = 1.5;
// 안쪽 링이 외곽선 안쪽 면과 딱 붙도록 — 두 stroke의 절반 합만큼 안쪽
const R_INNER_RING = R_OUTER - (STROKE_OUTER + STROKE_INNER) / 2;
const FILL = "#95a2b3";
const CUT_WIDTH = 1;

function arcEnd(angleDeg: number, r: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

function buildSvg(): string {
  // 3분할: 분할선 방향 = 6시(90°), 10시(210°), 2시(330°)
  const angles = [90, 210, 330];
  const cuts = angles
    .map((a) => {
      const [x, y] = arcEnd(a, R_OUTER);
      return `<line x1="${CX}" y1="${CY}" x2="${x.toFixed(3)}" y2="${y.toFixed(3)}" stroke="black" stroke-width="${CUT_WIDTH}" stroke-linecap="butt"/>`;
    })
    .join("\n      ");

  // 마스크: 검정=투명. 안쪽 링 자리도 컷으로 투명화 (annulus)
  return `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <mask id="cuts">
      <rect width="14" height="14" fill="white"/>
      <circle cx="${CX}" cy="${CY}" r="${R_INNER_RING}" fill="none" stroke="black" stroke-width="${STROKE_INNER}"/>
      ${cuts}
    </mask>
  </defs>
  <g mask="url(#cuts)">
    <circle cx="${CX}" cy="${CY}" r="${R_OUTER}" fill="${FILL}"/>
  </g>
  <circle cx="${CX}" cy="${CY}" r="${R_OUTER}" fill="none" stroke="${FILL}" stroke-width="${STROKE_OUTER}"/>
</svg>`;
}

async function main() {
  const svg = buildSvg();
  await sharp(Buffer.from(svg))
    .resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(OUT);
  const stat = fs.statSync(OUT);
  console.log(`✓ ${OUT} (${stat.size}B)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
