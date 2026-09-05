/*
 * Hand-authored SVG scenery.
 *
 * Every habitat is drawn in a 200x200 user-unit box and rendered with
 * `height:100%; width:auto`, so the artwork keeps its proportions in any slot
 * and the anchor below always lands on the same spot of the picture.
 *
 * `back` is painted behind the produce, `front` in front of it. That single
 * split is what makes a carrot look planted instead of pasted: the soil ridge
 * is a front layer that hides the lower third of the root.
 */

import { HABITAT_PULL } from "./content.js";

const PALETTE = {
  shade: "rgba(46,74,42,.16)",
  trunk: "#9a6f4b",
  trunkDark: "#82593a",
  wood: "#c69660",
  woodDark: "#a97a48",
  leafDark: "#4f9c55",
  leaf: "#5cab5e",
  leafMid: "#68b665",
  leafLight: "#7cc673",
  grass: "#7cc06f",
  grassLight: "#8ccb79",
  soilDeep: "#8b5c3b",
  soil: "#a9764e",
  soilFront: "#b07c52",
  soilRim: "#c69069",
};

function svg(className, body) {
  return (
    '<svg class="' + className + '" viewBox="0 0 200 200" role="presentation" focusable="false">'
    + body
    + "</svg>"
  );
}

const TREE_BACK = svg(
  "habitat-art habitat-back",
  '<ellipse cx="100" cy="188" rx="60" ry="10" fill="' + PALETTE.shade + '"/>'
  + '<path d="M91 92h18v82c0 6 5 10 15 12H76c10-2 15-6 15-12z" fill="' + PALETTE.trunk + '"/>'
  + '<path d="M100 92h9v82c0 6 5 10 15 12h-24z" fill="' + PALETTE.trunkDark + '"/>'
  + '<circle cx="60" cy="88" r="40" fill="' + PALETTE.leafDark + '"/>'
  + '<circle cx="140" cy="88" r="40" fill="' + PALETTE.leafDark + '"/>'
  + '<circle cx="100" cy="60" r="47" fill="' + PALETTE.leaf + '"/>'
  + '<circle cx="128" cy="98" r="31" fill="' + PALETTE.leafMid + '"/>'
  + '<circle cx="74" cy="100" r="29" fill="' + PALETTE.leaf + '"/>'
  + '<circle cx="76" cy="50" r="24" fill="' + PALETTE.leafMid + '"/>'
  + '<circle cx="122" cy="42" r="17" fill="' + PALETTE.leafLight + '"/>',
);

const PALM_BACK = svg(
  "habitat-art habitat-back",
  '<ellipse cx="100" cy="188" rx="52" ry="9" fill="' + PALETTE.shade + '"/>'
  + '<path d="M106 184c-6-42-8-74-14-98" fill="none" stroke="#a2814f" stroke-width="18" stroke-linecap="round"/>'
  + '<path d="M106 184c-6-42-8-74-14-98" fill="none" stroke="#8a6a3e" stroke-width="6" stroke-linecap="round" opacity=".4"/>'
  + '<g fill="' + PALETTE.leaf + '">'
  + '<ellipse cx="50" cy="76" rx="42" ry="13" transform="rotate(-15 50 76)"/>'
  + '<ellipse cx="140" cy="74" rx="42" ry="13" transform="rotate(14 140 74)"/>'
  + '<ellipse cx="62" cy="48" rx="34" ry="12" transform="rotate(-40 62 48)"/>'
  + '<ellipse cx="126" cy="46" rx="34" ry="12" transform="rotate(38 126 46)"/>'
  + "</g>"
  + '<ellipse cx="92" cy="30" rx="13" ry="24" fill="' + PALETTE.leafMid + '"/>',
);

const TRELLIS_BACK = svg(
  "habitat-art habitat-back",
  '<ellipse cx="100" cy="190" rx="72" ry="9" fill="' + PALETTE.shade + '"/>'
  + '<rect x="22" y="50" width="16" height="142" rx="7" fill="' + PALETTE.woodDark + '"/>'
  + '<rect x="162" y="50" width="16" height="142" rx="7" fill="' + PALETTE.woodDark + '"/>'
  + '<rect x="10" y="40" width="180" height="17" rx="8" fill="' + PALETTE.wood + '"/>'
  + '<g fill="none" stroke="' + PALETTE.woodDark + '" stroke-width="6" stroke-linecap="round" opacity=".85">'
  + '<path d="M42 78h116M42 106h116"/></g>'
  + '<path d="M100 56v40" fill="none" stroke="' + PALETTE.leafDark + '" stroke-width="7" stroke-linecap="round"/>'
  + '<g fill="' + PALETTE.leafMid + '">'
  + '<ellipse cx="44" cy="36" rx="19" ry="11" transform="rotate(-18 44 36)"/>'
  + '<ellipse cx="154" cy="34" rx="19" ry="11" transform="rotate(16 154 34)"/>'
  + '<ellipse cx="100" cy="28" rx="17" ry="10"/></g>',
);

const BUSH_BACK = svg(
  "habitat-art habitat-back",
  '<ellipse cx="100" cy="190" rx="66" ry="10" fill="' + PALETTE.shade + '"/>'
  + '<circle cx="58" cy="142" r="36" fill="' + PALETTE.leafDark + '"/>'
  + '<circle cx="142" cy="142" r="36" fill="' + PALETTE.leafDark + '"/>'
  + '<circle cx="100" cy="124" r="45" fill="' + PALETTE.leaf + '"/>'
  + '<circle cx="76" cy="112" r="25" fill="' + PALETTE.leafMid + '"/>'
  + '<circle cx="128" cy="152" r="27" fill="' + PALETTE.leaf + '"/>',
);

const BUSH_FRONT = svg(
  "habitat-art habitat-front",
  '<g fill="' + PALETTE.leafMid + '">'
  + '<ellipse cx="62" cy="150" rx="27" ry="15" transform="rotate(-16 62 150)"/>'
  + '<ellipse cx="140" cy="154" rx="27" ry="15" transform="rotate(14 140 154)"/>'
  + '<ellipse cx="100" cy="168" rx="31" ry="16" fill="' + PALETTE.leafLight + '"/></g>',
);

const VINE_BACK = svg(
  "habitat-art habitat-back",
  '<ellipse cx="100" cy="186" rx="80" ry="15" fill="' + PALETTE.grass + '"/>'
  + '<ellipse cx="100" cy="181" rx="62" ry="10" fill="' + PALETTE.grassLight + '"/>'
  + '<g fill="none" stroke="' + PALETTE.leafDark + '" stroke-width="7" stroke-linecap="round">'
  + '<path d="M24 168c30-14 52-4 72-18"/><path d="M176 170c-30-14-50-4-70-18"/></g>'
  + '<g fill="' + PALETTE.leaf + '">'
  + '<ellipse cx="32" cy="158" rx="23" ry="14" transform="rotate(-18 32 158)"/>'
  + '<ellipse cx="168" cy="160" rx="23" ry="14" transform="rotate(18 168 160)"/></g>',
);

const VINE_FRONT = svg(
  "habitat-art habitat-front",
  '<ellipse cx="62" cy="174" rx="28" ry="14" fill="' + PALETTE.leafMid + '" transform="rotate(-12 62 174)"/>'
  + '<ellipse cx="140" cy="176" rx="26" ry="13" fill="' + PALETTE.leaf + '" transform="rotate(12 140 176)"/>',
);

const GROUND_BACK = svg(
  "habitat-art habitat-back",
  '<ellipse cx="100" cy="188" rx="82" ry="18" fill="' + PALETTE.soilDeep + '"/>'
  + '<ellipse cx="100" cy="182" rx="76" ry="15" fill="' + PALETTE.soil + '"/>'
  + '<ellipse cx="100" cy="178" rx="58" ry="10" fill="' + PALETTE.soilRim + '" opacity=".55"/>',
);

const GROUND_FRONT = svg(
  "habitat-art habitat-front",
  '<ellipse cx="58" cy="178" rx="26" ry="12" fill="' + PALETTE.leafMid + '" transform="rotate(-14 58 178)"/>'
  + '<ellipse cx="144" cy="180" rx="26" ry="12" fill="' + PALETTE.leaf + '" transform="rotate(14 144 180)"/>',
);

const SOIL_BACK = svg(
  "habitat-art habitat-back",
  '<ellipse cx="100" cy="196" rx="96" ry="44" fill="' + PALETTE.soilDeep + '"/>'
  + '<ellipse cx="100" cy="188" rx="92" ry="38" fill="' + PALETTE.soil + '"/>',
);

/* The front ridge is what buries the root. Grass tufts flank the produce so
 * even a leafless tuber such as さつまいも still reads as planted. */
const SOIL_FRONT = svg(
  "habitat-art habitat-front",
  '<path d="M6 200c0-27 42-46 94-46s94 19 94 46z" fill="' + PALETTE.soilFront + '"/>'
  + '<path d="M6 200c0-27 42-46 94-46s94 19 94 46" fill="none" stroke="' + PALETTE.soilRim + '" stroke-width="6" stroke-linecap="round"/>'
  + '<g fill="none" stroke="' + PALETTE.leafDark + '" stroke-width="5" stroke-linecap="round">'
  + '<path d="M44 176c-4-12-3-20 2-27M52 175c1-13 5-20 12-25M148 178c4-12 3-20-2-27M140 177c-1-13-5-20-12-25"/></g>'
  + '<g fill="#96663f" opacity=".45">'
  + '<ellipse cx="40" cy="188" rx="10" ry="5"/><ellipse cx="156" cy="190" rx="9" ry="4"/>'
  + '<ellipse cx="100" cy="194" rx="11" ry="5"/></g>',
);

/* --------------------------------------------------------------- hideouts */
/*
 * Peekaboo containers. Each one is an open-topped thing drawn from `coverTop`
 * downwards, and the guest is clipped to the space above that line — so a
 * hidden guest is genuinely not on screen, and a revealed one rises out of the
 * opening rather than fading in on top of it. The surprise depends on the
 * clip, never on the artwork being opaque, which is what lets six very
 * different shapes share one reveal.
 */
const CLAY = { deep: "#b96a44", body: "#d1855b", rim: "#e2a279", shade: "#a75e3c" };
const WOOD = { deep: "#9a6f45", body: "#c39359", rim: "#d9ac74", line: "#8a6238" };
/* The leaf pile is autumn on purpose: green would make it a second bush. */
const FALL = { deep: "#c25f2b", body: "#e08b38", light: "#f0bb4d", pale: "#f5d47a" };

const POT_BACK = svg(
  "hideout-art hideout-back",
  '<ellipse cx="100" cy="192" rx="74" ry="12" fill="' + PALETTE.shade + '"/>'
  + '<ellipse cx="100" cy="110" rx="70" ry="21" fill="' + CLAY.shade + '"/>',
);

const POT_FRONT = svg(
  "hideout-art hideout-front",
  '<path d="M30 110c0 66 22 86 70 86s70-20 70-86z" fill="' + CLAY.body + '"/>'
  + '<path d="M100 110c0 66-18 86-44 86 24 8 64 8 88 0-18-2-44-20-44-86z" fill="' + CLAY.deep + '" opacity=".32"/>'
  + '<path d="M30 110a70 21 0 0 0 140 0" fill="none" stroke="' + CLAY.rim + '" stroke-width="13" stroke-linecap="round"/>'
  + '<g fill="' + CLAY.rim + '" opacity=".45">'
  + '<ellipse cx="66" cy="150" rx="12" ry="7"/><ellipse cx="128" cy="168" rx="10" ry="6"/></g>',
);

const BOX_BACK = svg(
  "hideout-art hideout-back",
  '<ellipse cx="100" cy="194" rx="78" ry="11" fill="' + PALETTE.shade + '"/>'
  + '<rect x="26" y="96" width="148" height="30" rx="7" fill="' + WOOD.deep + '"/>',
);

const BOX_FRONT = svg(
  "hideout-art hideout-front",
  '<rect x="24" y="114" width="152" height="82" rx="10" fill="' + WOOD.body + '"/>'
  + '<g stroke="' + WOOD.line + '" stroke-width="5" opacity=".5">'
  + '<path d="M24 144h152M24 172h152"/></g>'
  + '<rect x="16" y="102" width="168" height="24" rx="11" fill="' + WOOD.rim + '"/>'
  + '<rect x="16" y="102" width="168" height="9" rx="4" fill="#eec894" opacity=".55"/>',
);

const LEAF_BACK = svg(
  "hideout-art hideout-back",
  '<ellipse cx="100" cy="194" rx="84" ry="11" fill="' + PALETTE.shade + '"/>'
  + '<circle cx="48" cy="150" r="42" fill="' + FALL.deep + '"/>'
  + '<circle cx="152" cy="150" r="42" fill="' + FALL.deep + '"/>'
  + '<circle cx="100" cy="138" r="38" fill="' + FALL.body + '"/>',
);

const LEAF_FRONT = svg(
  "hideout-art hideout-front",
  '<g fill="' + FALL.body + '">'
  + '<ellipse cx="34" cy="140" rx="36" ry="20" transform="rotate(-24 34 140)"/>'
  + '<ellipse cx="166" cy="142" rx="36" ry="20" transform="rotate(22 166 142)"/>'
  + '<ellipse cx="100" cy="148" rx="40" ry="22"/></g>'
  + '<g fill="' + FALL.light + '">'
  + '<ellipse cx="58" cy="168" rx="36" ry="20" transform="rotate(-13 58 168)"/>'
  + '<ellipse cx="144" cy="172" rx="36" ry="20" transform="rotate(13 144 172)"/></g>'
  + '<ellipse cx="100" cy="186" rx="48" ry="19" fill="' + FALL.pale + '"/>',
);

const STUMP_BACK = svg(
  "hideout-art hideout-back",
  '<ellipse cx="100" cy="194" rx="76" ry="11" fill="' + PALETTE.shade + '"/>'
  + '<ellipse cx="100" cy="106" rx="68" ry="23" fill="#b3855c"/>'
  + '<ellipse cx="100" cy="108" rx="56" ry="17" fill="#6f4a2c"/>',
);

/* Only the near half of the rim is in the cover. The far half stays behind, or
 * it would draw a line straight across whoever is standing in the hollow. */
const STUMP_FRONT = svg(
  "hideout-art hideout-front",
  '<path d="M32 106c-2 60 4 84 68 84s70-24 68-84z" fill="' + PALETTE.trunk + '"/>'
  + '<g stroke="' + PALETTE.trunkDark + '" stroke-width="6" fill="none" opacity=".5">'
  + '<path d="M62 128c3 26 2 42-2 58M138 128c-3 26-2 42 2 58"/></g>'
  + '<path d="M32 106a68 23 0 0 0 136 0" fill="none" stroke="#b3855c" stroke-width="13" stroke-linecap="round"/>'
  + '<g fill="' + PALETTE.leafMid + '">'
  + '<ellipse cx="38" cy="176" rx="28" ry="13" transform="rotate(-16 38 176)"/>'
  + '<ellipse cx="164" cy="178" rx="28" ry="13" transform="rotate(15 164 178)"/></g>',
);

const BASKET_BACK = svg(
  "hideout-art hideout-back",
  '<ellipse cx="100" cy="194" rx="70" ry="11" fill="' + PALETTE.shade + '"/>'
  + '<path d="M40 112c0-52 120-52 120 0" fill="none" stroke="' + WOOD.deep + '" stroke-width="13" stroke-linecap="round"/>'
  + '<ellipse cx="100" cy="114" rx="68" ry="20" fill="' + WOOD.deep + '"/>',
);

const BASKET_FRONT = svg(
  "hideout-art hideout-front",
  '<path d="M34 114c5 62 18 80 66 80s61-18 66-80z" fill="' + WOOD.body + '"/>'
  + '<g stroke="' + WOOD.deep + '" stroke-width="4" fill="none" opacity=".5">'
  + '<path d="M36 140h128M40 164h120M46 184h108"/>'
  + '<path d="M66 118v70M100 118v76M134 118v70"/></g>'
  + '<path d="M34 114a68 20 0 0 0 136 0" fill="none" stroke="' + WOOD.rim + '" stroke-width="14" stroke-linecap="round"/>',
);

const BUSH_HIDE_FRONT = svg(
  "hideout-art hideout-front",
  '<g fill="' + PALETTE.leafDark + '">'
  + '<circle cx="42" cy="152" r="40"/><circle cx="158" cy="152" r="40"/></g>'
  + '<g fill="' + PALETTE.leaf + '">'
  + '<circle cx="78" cy="144" r="38"/><circle cx="124" cy="148" r="38"/></g>'
  + '<g fill="' + PALETTE.leafMid + '">'
  + '<ellipse cx="56" cy="178" rx="38" ry="20"/><ellipse cx="146" cy="180" rx="38" ry="20"/>'
  + '<ellipse cx="100" cy="188" rx="40" ry="18" fill="' + PALETTE.leafLight + '"/></g>',
);

/*
 * `coverTop` is where the opening is, as a percentage of the box: the guest is
 * clipped above it and the container is drawn below it. `guestScale` is the
 * guest's width as a fraction of the box, and `lip` sinks it into the opening
 * far enough that it reads as standing inside rather than balanced on top —
 * sprites carry transparent margins, so a small lip leaves a guest floating.
 */
export const HIDEOUTS = {
  bush: { back: BUSH_BACK, front: BUSH_HIDE_FRONT, coverTop: 70, guestScale: 0.6, lip: 20 },
  pot: { back: POT_BACK, front: POT_FRONT, coverTop: 56, guestScale: 0.48, lip: 18 },
  box: { back: BOX_BACK, front: BOX_FRONT, coverTop: 56, guestScale: 0.52, lip: 18 },
  leaves: { back: LEAF_BACK, front: LEAF_FRONT, coverTop: 70, guestScale: 0.58, lip: 20 },
  hollow: { back: STUMP_BACK, front: STUMP_FRONT, coverTop: 54, guestScale: 0.48, lip: 17 },
  basket: { back: BASKET_BACK, front: BASKET_FRONT, coverTop: 58, guestScale: 0.48, lip: 18 },
};

export function hideoutFor(name) {
  return HIDEOUTS[name] || HIDEOUTS.box;
}

/*
 * anchorX / anchorY are percentages of the habitat box.
 * scale is the produce width as a fraction of the habitat width.
 * rise is how far (in produce heights) a harvest animation lifts before flying.
 * The pull direction is not repeated here: it comes from HABITAT_PULL, so the
 * gesture, the guidance and the board layout can never disagree.
 */
export const HABITATS = {
  tree: { back: TREE_BACK, front: "", anchorX: 50, anchorY: 43, scale: 0.4, rise: 0.08 },
  palm: { back: PALM_BACK, front: "", anchorX: 46, anchorY: 51, scale: 0.4, rise: 0.08 },
  trellis: { back: TRELLIS_BACK, front: "", anchorX: 50, anchorY: 60, scale: 0.38, rise: 0.08 },
  bush: { back: BUSH_BACK, front: BUSH_FRONT, anchorX: 50, anchorY: 58, scale: 0.4, rise: 0.16 },
  vine: { back: VINE_BACK, front: VINE_FRONT, anchorX: 50, anchorY: 70, scale: 0.46, rise: 0.14 },
  ground: { back: GROUND_BACK, front: GROUND_FRONT, anchorX: 50, anchorY: 68, scale: 0.44, rise: 0.14 },
  soil: { back: SOIL_BACK, front: SOIL_FRONT, anchorX: 50, anchorY: 70, scale: 0.46, rise: 0.34 },
};

/*
 * A few sprites were drawn lying on a diagonal. Rotating them upright is what
 * makes "planted in the soil" and "hanging from the trellis" believable.
 */
export const PRODUCE_ROTATION = {
  carrot: -36,
  daikon: -36,
  cucumber: -44,
  "sweet-potato": -12,
  edamame: -18,
};

export function habitatFor(name) {
  return HABITATS[name] || HABITATS.ground;
}

export function pullDirection(name) {
  return HABITAT_PULL[name] || "up";
}

/* +1 pulls the sprite downward on screen, -1 upward. */
export function pullSign(name) {
  return pullDirection(name) === "down" ? 1 : -1;
}

/*
 * Distant hills that sit exactly on the horizon defined in styles.css, so the
 * plots below them stand on grass instead of floating in the sky. Sun and
 * clouds are CSS gradients; only the hills need a drawn silhouette.
 */
export function backdropMarkup() {
  return (
    '<svg class="backdrop-hills" viewBox="0 0 1200 200" preserveAspectRatio="none" role="presentation" focusable="false">'
    + '<path d="M0 200V104c132-58 264-58 396-14 132 44 252 38 372-12 108-46 240-46 432 30v92z" fill="#8ec97f"/>'
    + '<path d="M0 200v-52c164-46 322-26 486 18 164 44 322 22 452-26 84-32 178-32 262-4v64z" fill="#7cbd6e"/>'
    + "</svg>"
  );
}
