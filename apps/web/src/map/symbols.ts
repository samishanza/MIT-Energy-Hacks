// Electrical site-plan legend symbols, drawn as small SVGs for map markers. The shapes follow
// the conventions in the supplied plan sets and common electrical legends (IEEE 315 style):
// a pole is a circle with a center dot, a transformer two linked windings, a panel or
// switchboard a half-filled rectangle, a disconnect a switch blade, a breaker an arc, a
// battery long and short plates, and a substation a double square.

const EXISTING = "#b5121b";
const NEW = "#0b5cad";

function wrap(body: string, size = 26): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 26 26" aria-hidden="true">${body}</svg>`;
}

export function symbolSvg(tag: string, isNew: boolean): string {
  const c = isNew ? NEW : EXISTING;
  const white = `fill="#fff" stroke="${c}" stroke-width="2"`;
  switch (tag) {
    case "P":
      return wrap(`<circle cx="13" cy="13" r="8" ${white}/><circle cx="13" cy="13" r="3" fill="${c}"/>`, 22);
    case "T":
      return wrap(`<rect x="2" y="2" width="22" height="22" ${white}/><circle cx="10" cy="13" r="5" fill="none" stroke="${c}" stroke-width="2"/><circle cx="16" cy="13" r="5" fill="none" stroke="${c}" stroke-width="2"/>`);
    case "MDP":
      return wrap(`<rect x="2" y="7" width="22" height="12" ${white}/><path d="M2 19 L24 7 L24 19 Z" fill="${c}"/>`);
    case "DS":
      return wrap(`<rect x="2" y="2" width="22" height="22" ${white}/><circle cx="7" cy="18" r="2" fill="${c}"/><circle cx="19" cy="18" r="2" fill="${c}"/><line x1="7" y1="18" x2="18" y2="8" stroke="${c}" stroke-width="2"/>`);
    case "CB":
      return wrap(`<rect x="2" y="2" width="22" height="22" ${white}/><path d="M6 17 Q13 5 20 17" fill="none" stroke="${c}" stroke-width="2"/>`);
    case "ESS":
      return wrap(`<rect x="1" y="4" width="24" height="18" ${white}/><line x1="9" y1="8" x2="9" y2="18" stroke="${c}" stroke-width="2"/><line x1="13" y1="10" x2="13" y2="16" stroke="${c}" stroke-width="3"/><line x1="17" y1="8" x2="17" y2="18" stroke="${c}" stroke-width="2"/>`, 30);
    case "SUB":
      return wrap(`<rect x="2" y="2" width="22" height="22" ${white}/><rect x="7" y="7" width="12" height="12" fill="none" stroke="${c}" stroke-width="2"/><path d="M14 8 L10 14 L14 14 L11 19" fill="none" stroke="${c}" stroke-width="1.6"/>`);
    default:
      return wrap(`<circle cx="13" cy="13" r="6" ${white}/>`, 18);
  }
}
