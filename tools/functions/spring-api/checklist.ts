// PHH spring clean checklist. v2, 24 Nov 2026: expanded after Marie's feedback via Bella (window, wardrobe and sliding door
// tracks, inside windows) plus oven, rangehood, laundry, fly screens and other usual spring clean gaps. 31 -> 48 items.
// v1 (5 Nov): housekeeper intranet, Spring Cleans page. Every item ticked or N/A ("as applicable").
// Item ids are kept forever: a saved spring clean is reviewed against the ids it was ticked with.
export const SPRING_CHECKLIST_RAW: { id: string; title: string; items: [string, string][] }[] = [
  { id: "all", title: "All areas", items: [
    ["sc_skirting", "Clean skirting boards"], ["sc_grout", "Clean tile grout"], ["sc_walls", "Clean marks, bugs and cobwebs off walls and ceilings"],
    ["sc_win_in", "Clean the inside of all windows and glass doors"], ["sc_win_tracks", "Clean all window tracks"], ["sc_door_tracks", "Clean all sliding door tracks"],
    ["sc_blinds", "Wipe down all blinds"], ["sc_handles", "Wipe door handles, light switches and power points"], ["sc_lamps", "Clean lamps and light fittings"],
    ["sc_fans", "Clean and wipe ceiling and pedestal fans"], ["sc_vents", "Clean exhaust fans and vents"],
    ["sc_aircon", "Remove and wash air conditioning filters"], ["sc_lights", "Check all lights are working"]] },
  { id: "living", title: "Living areas", items: [
    ["sc_furniture", "Move all furniture and clean behind"], ["sc_couch", "Remove cushions from couches and vacuum"], ["sc_cushions", "Wash all cushions"],
    ["sc_tv", "Dust and wipe TV, DVD, Foxtel and games consoles"], ["sc_fireplace", "Clean fireplace and surrounds"]] },
  { id: "kitchen", title: "Kitchen", items: [
    ["sc_empty", "Remove all items from drawers and cupboards"], ["sc_cupboards", "Clean drawers and cupboards inside and out"],
    ["sc_oven", "Clean inside the oven, racks and trays"], ["sc_rangehood", "Clean the rangehood and its filters"],
    ["sc_stove", "Clean around the stove (move it if freestanding)"], ["sc_microwave", "Clean inside the microwave"],
    ["sc_dishwasher", "Clean the dishwasher filter and door seals"], ["sc_behind", "Clean behind the fridge and appliances"],
    ["sc_fridge", "Clean out fridge and freezer, wipe down all shelves"]] },
  { id: "bedrooms", title: "Bedrooms", items: [
    ["sc_beds", "Pull out beds and vacuum behind"], ["sc_wardrobes", "Vacuum and wipe inside wardrobes, cupboards and bedside cabinets"],
    ["sc_wardrobe_tracks", "Clean wardrobe door tracks and doors"],
    ["sc_bedfurn", "Move all furniture, vacuum and mop behind"], ["sc_protectors", "Remove and wash all pillow and mattress protectors (linen service)"]] },
  { id: "bathrooms", title: "Bathrooms", items: [
    ["sc_shower", "Scrub shower floor and walls"], ["sc_screens", "Clean shower screens and doors (no mould)"], ["sc_curtains", "Check shower curtains for replacement"],
    ["sc_taps", "Descale taps and shower heads"], ["sc_toilet", "Clean the toilet base and behind the toilet"],
    ["sc_corners", "Scrub bathroom corners"], ["sc_vanity", "Clean inside vanity and drawers"]] },
  { id: "laundry", title: "Laundry", items: [
    ["sc_washer", "Clean the washing machine seal and filter"], ["sc_dryer", "Clean the dryer lint filter"],
    ["sc_laundry", "Clean the laundry tub and behind the machines"]] },
  { id: "exterior", title: "Exterior", items: [
    ["sc_decks", "Wash decks and patio areas"], ["sc_outdoor", "Wash and wipe down outdoor furniture"], ["sc_bbq", "Deep clean the BBQ"],
    ["sc_flyscreens", "Clean fly screens"], ["sc_eaves", "Remove cobwebs from eaves and outdoor lights"],
    ["sc_hose", "Hose exterior walls, windows, decks and pergolas as needed to remove webs and bugs"]] },
];
// v1 item ids (31). A spring clean started before v2 went live keeps the v1 list, so nobody gets new items mid-clean.
export const V2_FROM = "2026-11-24T06:10:00Z";
export const V1_IDS = new Set(["sc_skirting", "sc_grout", "sc_walls", "sc_blinds", "sc_lamps", "sc_fans", "sc_aircon", "sc_lights",
  "sc_furniture", "sc_couch", "sc_cushions", "sc_tv", "sc_fireplace", "sc_empty", "sc_cupboards", "sc_stove", "sc_behind", "sc_fridge",
  "sc_beds", "sc_wardrobes", "sc_bedfurn", "sc_protectors", "sc_shower", "sc_screens", "sc_curtains", "sc_corners", "sc_vanity",
  "sc_decks", "sc_outdoor", "sc_bbq", "sc_hose"]);
