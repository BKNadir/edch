// Station icons, one per kind of station (game/stationTypes.ts), drawn in the theme's colour.
//
// Coriolis, Orbis, Ocellus, asteroid base, outpost, megaship, planetary port and settlement come from
// EDAssets (https://github.com/SpyTec/EDAssets, MIT licence, Copyright (c) 2015 Eric "SpyTec"
// Gustavsson, commit 5a9b2f8), which redraws the game's own icons; their colours were replaced by
// the theme's and a stroke was added so every icon has the same line thickness. The others (Dodec,
// carriers, installation, planetary outpost, construction depot) are EDCH's own drawings in the
// same spirit. The game's designs are Frontier Developments'; see NOTICE.

import { stationKind, type StationKind } from "../game/stationTypes.js";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/** EDCH's own icons: lines on a 24 × 24 grid, as thick as the EDAssets ones once fitted. */
const OWN_ATTRIBUTES = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "1.8",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
};

/** Each icon: the attributes of its <svg> and what it holds (constant, trusted markup). */
const STATION_ICONS: Record<StationKind, { attributes: Record<string, string>; markup: string }> = {
  coriolis: {
    attributes: {
      viewBox: "-43.1 -43.1 1010.2 1010.2",
      stroke: "currentColor",
      "stroke-width": "43.1",
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
    },
    markup:
      '<g id="Layer_2"><g><rect x="327" y="433" fill="currentColor" width="270" height="58"/></g><g><path fill="currentColor" d="M462,21.0l404.9,35.9L902.9,462L866.9,866.9L462,902.9L57.0,866.9L21.0,462L57.0,57.0 L462,21.0 M462,0L37.6,37.6L0,462l37.6,424.3L462,924l424.3-37.6L924,462L886.3,37.6L462,0L462,0z"/></g><g><path fill="currentColor" d="M462,29.6L894.3,462L462,894.3L29.6,462L462,29.6 M462,0L0,462l462,462l462-462L462,0L462,0z"/></g></g>',
  },
  orbis: {
    attributes: {
      viewBox: "-34.7 -34.7 994.4 994.4",
      stroke: "currentColor",
      "stroke-width": "34.7",
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
    },
    markup:
      '<g id="Layer_4"><rect x="328.5" y="433.5" fill="currentColor" width="268" height="58"/><g><path fill="currentColor" d="M462.5,302c88.6,0,160.5,71.8,160.5,160.5c0,88.6-71.8,160.5-160.5,160.5 C373.8,623,302,551.1,302,462.5C302,373.8,373.8,302,462.5,302 M462.5,272c-25.7,0-50.6,5.0-74.1,14.9 c-22.6,9.5-43.0,23.3-60.5,40.8c-17.4,17.4-31.2,37.8-40.8,60.5C277.0,411.8,272,436.7,272,462.5 s5.0,50.6,14.9,74.1c9.5,22.6,23.3,43.0,40.8,60.5c17.4,17.4,37.8,31.2,60.5,40.8 C411.8,647.9,436.7,653,462.5,653s50.6-5.0,74.1-14.9c22.6-9.5,43.0-23.3,60.5-40.8 s31.2-37.8,40.8-60.5C647.9,513.1,653,488.2,653,462.5s-5.0-50.6-14.9-74.1 c-9.5-22.6-23.3-43.0-40.8-60.5c-17.4-17.4-37.8-31.2-60.5-40.8C513.1,277.0,488.2,272,462.5,272 L462.5,272z"/></g><path fill="currentColor" d="M462.5,30C701.3,30,895,223.6,895,462.5S701.3,895,462.5,895C223.6,895,30,701.3,30,462.5 C30,223.6,223.6,30,462.5,30 M462.5,0c-62.4,0-122.9,12.2-180.0,36.3c-55.0,23.2-104.5,56.6-147.0,99.1 c-42.4,42.4-75.8,91.9-99.1,147.0C12.2,339.5,0,400.0,0,462.5s12.2,122.9,36.3,180.0 c23.2,55.0,56.6,104.5,99.1,147.0c42.4,42.4,91.9,75.8,147.0,99.1C339.5,912.7,400.0,925,462.5,925 s122.9-12.2,180.0-36.3c55.0-23.2,104.5-56.6,147.0-99.1c42.4-42.4,75.8-91.9,99.1-147.0 C912.7,585.4,925,524.9,925,462.5s-12.2-122.9-36.3-180.0c-23.2-55.0-56.6-104.5-99.1-147.0 c-42.4-42.4-91.9-75.8-147.0-99.1C585.4,12.2,524.9,0,462.5,0L462.5,0z"/><line fill="none" stroke="currentColor" stroke-width="64.7" stroke-miterlimit="10" x1="861.1" y1="667.1" x2="621.5" y2="550.9"/><line fill="none" stroke="currentColor" stroke-width="64.7" stroke-miterlimit="10" x1="462.4" y1="29.8" x2="462.5" y2="296.0"/><line fill="none" stroke="currentColor" stroke-width="64.7" stroke-miterlimit="10" x1="87.8" y1="678.8" x2="318.3" y2="545.6"/></g>',
  },
  ocellus: {
    attributes: {
      viewBox: "-25.0 -25.0 960.0 960.0",
      stroke: "currentColor",
      "stroke-width": "25.0",
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
    },
    markup:
      '<g id="Layer_4"><path fill="currentColor" d="M455,37c230.8,0,418,187.1,418,418c0,230.8-187.1,418-418,418C224.1,873,37,685.8,37,455 C37,224.1,224.1,37,455,37 M455,0c-61.4,0-121,12.0-177.1,35.7c-54.1,22.9-102.8,55.7-144.6,97.4 s-74.5,90.4-97.4,144.6C12.0,334,0,393.5,0,455s12.0,121,35.7,177.1c22.9,54.1,55.7,102.8,97.4,144.6 c41.7,41.7,90.4,74.5,144.6,97.4C334,897.9,393.5,910,455,910s121-12.0,177.1-35.7 c54.1-22.9,102.8-55.7,144.6-97.4c41.7-41.7,74.5-90.4,97.4-144.6C897.9,576,910,516.4,910,455 s-12.0-121-35.7-177.1c-22.9-54.1-55.7-102.8-97.4-144.6c-41.7-41.7-90.4-74.5-144.6-97.4 C576,12.0,516.4,0,455,0L455,0z"/><g><path fill="currentColor" d="M455,270c102.1,0,185,82.8,185,185s-82.8,185-185,185s-185-82.8-185-185S352.8,270,455,270 M455,233c-29.9,0-59.0,5.8-86.4,17.4c-26.4,11.1-50.1,27.1-70.5,47.5 c-20.3,20.3-36.3,44.1-47.5,70.5C238.8,395.9,233,425.0,233,455c0,29.9,5.8,59.0,17.4,86.4 c11.1,26.4,27.1,50.1,47.5,70.5c20.3,20.3,44.1,36.3,70.5,47.5C395.9,671.1,425.0,677,455,677 c29.9,0,59.0-5.8,86.4-17.4c26.4-11.1,50.1-27.1,70.5-47.5c20.3-20.3,36.3-44.1,47.5-70.5 C671.1,514.0,677,484.9,677,455c0-29.9-5.8-59.0-17.4-86.4c-11.1-26.4-27.1-50.1-47.5-70.5 c-20.3-20.3-44.1-36.3-70.5-47.5C514.0,238.8,484.9,233,455,233L455,233z"/></g><g><rect x="325" y="425" fill="currentColor" width="260" height="61"/></g></g>',
  },
  asteroidBase: {
    attributes: {
      viewBox: "31.7 91.2 1933.3 1820.6",
      stroke: "currentColor",
      "stroke-width": "74.4",
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
    },
    markup:
      '<g><path fill="currentColor" d="M777.6,301.3c24.8-0.8,42.6,10.1,61.6,17.0c112,41.3,223.2,84.2,334.9,125.3 c38.3,14.1,79.7,13.6,119.7,15.7c56.5,2.9,109.3,19.4,163.1,33.6c7.7,1.8,13.8,6.6,19.4,12.8 c63.2,71.7,126.6,143.2,189.8,214.6c27.1,30.6,44,68,64.8,102.6c51.2,85.0,100.2,170.9,150.6,256.2 c9.0,15.2,11.4,28.5,5.3,46.6c-30.6,93.8-59.7,188.5-89.0,282.9c-8.5,26.9-35.1,35.2-53.3,52 c-18.6,17.0-41.6,29.3-59.4,47.2c-34.4,33.8-78.6,28.5-120,33.3C1500,1549.0,1434.1,1552,1368.8,1560 c-35.2,4.2-66.6,23.2-99.7,36.2c-98.1,38.9-196.2,77.8-293.6,118.9c-32,13.3-58.4-1.8-85.8-8.8 c-87.4-22.4-174.1-47.4-261.0-71.2c-15.7-4.2-26.1-11.7-32.5-28c-50.4-126.4-121.6-241.3-192.8-356.5 c-35.4-57.3-67.4-116.5-101.6-174.4c-9.8-16.8-13.0-35.4-14.6-54.1c-8.5-89.3-17.6-178.4-29.3-267.2 c-1.8-14.4,0.2-28.2,7.4-41.8c59.4-111.7,118.6-223.7,177.3-336c8.8-17.0,21.0-26.6,39.7-29.3 c49.3-7.4,98.4-15.4,147.7-23.2c45.0-7.2,89.8-14.4,134.9-21.3C769.6,302.1,775.4,301.6,777.6,301.3z M938.9,1664.2c12.8,0.8,19.7-1.3,26.6-4c89.8-36,180.2-70.6,269.6-108.5 c70.3-29.8,141.3-52.2,219.2-53.6c54.6-1.0,109.3-9.6,164.2-14.4c7.4-0.8,13.8-3.2,20-7.7 c32-24.8,64-49.6,96.2-74.1c8.2-6.3,13.3-14.1,16.5-24.5c25.6-82.6,50.9-165.6,78.4-247.7 c5.6-16.8,2.6-28.5-5.3-42.3c-43.4-73.6-86.4-147.2-129.6-220.8c-21.6-36.8-40-76.2-66.9-108.8 c-57.3-68.8-118.4-133.6-177.6-200.2c-8.2-9.3-17.8-14.9-30.4-18.9c-58.4-18.6-118.4-24-178.9-29.0 c-28.2-2.3-57.3-4-85.0-14.6C1037.8,449.3,919.2,405.6,800.8,361.6c-10.1-3.7-20.2-4.8-31.7-3.2 c-82.6,13.0-165.6,25.0-248.2,38.1c-14.6,2.4-29.8,4-38.3,20.2C428,521.3,372.8,625.6,317.8,729.8 c-3.4,6.4-6.1,13.0-5.3,20.8c9.3,85.6,18.1,170.9,28,256.5c1.8,15.4,1.0,31.4,9.8,46.4 c30.1,51.1,59.4,102.6,89.0,154.1C496.2,1305.8,564,1397.8,607.2,1504c8.5,20.8,18.3,41.0,27.2,61.6 c5.0,11.7,12.2,19.2,26.1,22.9c66.4,17.3,132.2,36.5,198.1,54.6 C886.9,1650.6,915.4,1658.1,938.9,1664.2z"/><path fill="currentColor" d="M229.8,1710.1c-26.6-2.4-52.5-18.6-81.3-25.3c-29.3-6.9-38.4-24-41.3-53.8 c-4.8-48.5,5.3-91.2,29.6-132.2c9.8-16.8,17.8-34.4,20-54.6c1.8-17.8,12-28.8,31.7-32.8 c30.4-6.4,59.7-16.8,89.6-24.8c6.9-1.8,15.2-3.7,21.3-1.3c32.8,13.3,67.2,25.3,93.3,49.3 c30.9,28.2,57.6,61.0,86.4,91.7c14.1,15.1,16.8,29.8,5.0,48.8c-14.9,24-26.9,49.6-40,74.3 c-4.5,8.8-10.9,15.2-21.0,17.3c-58.9,14.1-117.8,28.2-177.0,42.1 C242.1,1709.8,237.6,1709.6,229.8,1710.1z M286.4,1440c-24.2,6.6-47.2,12.8-69.8,19.4 c-5.0,1.3-8.5,5.3-9.6,10.9c-6.4,27.2-19.7,51.4-33.3,75.2c-14.6,25.3-10.9,51.7-10.9,78.1 c0,3.2,1.3,9.0,3.4,9.6c26.9,8,50.9,28.5,81.8,21.0c44.2-10.6,88.2-21.3,132.5-31.4 c17.6-4,50.4-46.6,49.3-64.8c-0.2-5.6-3.4-9.3-6.9-13.0c-20-21.8-38.1-45.8-60.5-65.0 C340.8,1460.5,313.3,1449.8,286.4,1440z"/><path fill="currentColor" d="M1530.6,264.8c11.2,35.2-16,63.2-32.8,94.4c-5.3,9.8-16.2,13.6-27.4,15.2 c-25.8,3.4-51.2,9.0-75.4,17.8c-20.5,7.4-39.2,6.6-57.0-7.4c-12.5-9.8-25.8-18.6-39.7-26.4 c-18.9-10.4-24.5-25.6-20.2-45.3c5.6-26.9,12.5-53.3,17.6-80.2c3.4-17.6,15.2-25.3,30.4-30.1 c22.9-7.2,45.0-15.2,64.8-29.3c23.2-16.8,46.1-1.6,69.0,0.8c10.6,1.0,21.3,4.5,31.2,8.5 C1529.6,197.8,1530.4,199.7,1530.6,264.8z M1478.4,264.5c-0.8-32.8-1.0-32.8-32.5-40 c-18.9-4.2-36.5-4.5-53.3,8.8c-7.7,6.1-18.4,8-27.1,12.5c-7.4,3.7-19.4,3.4-20.8,13.3 c-2.3,18.6-12.8,35.7-9.6,55.2c0.2,1.8,1.8,4,3.4,5.3c16.8,12.8,32.8,26.4,56.5,16 c11.7-5.0,24.8-8,37.3-10.6C1464.5,318.1,1479.2,299.2,1478.4,264.5z"/><path fill="currentColor" d="M1637.3,1615.2c30.6,9.3,67.4,19.4,103.7,31.7c9.6,3.2,15.2,13.0,15.2,24.5 c0,8-1.3,16.5,1.0,23.7c16.8,51.7-16,86.4-41.6,123.2c-11.2,16-27.2,23.7-47.4,16 c-3.2-1.3-7.2-2.4-10.6-1.8c-46.4,5.6-74.4-23.7-102.4-53.3c-5.3-5.6-8.8-11.2-8.5-19.2 c2.1-51.7,11.2-100.5,57.0-133.6C1612,1620.2,1620.2,1614.9,1637.3,1615.2z M1704.5,1716.8 c4.2-18.9-3.1-30.4-24.2-33.3c-10.6-1.3-20.8-5.8-30.9-9.0c-8.2-2.3-15.4-1.0-22.6,3.4 c-29.6,19.4-29.3,76.8,1.8,92.8c15.4,8,36.8,17.6,50.6,4C1693.6,1760.8,1708.8,1742.6,1704.5,1716.8z"/><path fill="currentColor" d="M1027.4,1414.6c-244.2-1.8-419.2-184.2-420-420.5 c-0.8-216.8,182.9-411.7,419.4-407.4c224.5,4,412.2,169.8,413.3,425.0 C1441.3,1222.9,1261.3,1417.3,1027.4,1414.6z M1385.8,1011.2c1.0-218.9-166.6-366.9-358.9-370.6 c-193.3-4-367.4,165.3-365.6,353.6c1.8,202.6,156,369.3,372,367.7 C1228.2,1360.2,1389.3,1193.0,1385.8,1011.2z"/><path fill="currentColor" d="M1605.0,1164.2c-56.2,5.8-87.1-33.3-82.1-74.4c3.2-25.8,18.9-44.8,45.0-52.5 c21.0-6.1,42.6-8,64.5-7.1c28,1.0,51.7,19.7,58.6,46.3c7.7,29.8-4.2,61.8-28.5,76 C1644.2,1163.2,1624.5,1165.6,1605.0,1164.2z M1602.4,1108.5c9.6,0,16,0.2,22.6,0 c8-0.5,14.6-4.5,14.1-13.0c-0.5-8.2-7.2-12.5-15.4-12c-7.2,0.5-14.3,1.3-21.3,3.7 c-9.0,2.9-26.4-3.2-24.5,13.0C1579.7,1114.6,1595.7,1106.4,1602.4,1108.5z"/><path fill="currentColor" d="M1028.8,1234.4c-131.4,8.5-240.5-101.6-238.9-229.3 c1.8-141.0,95.4-234.1,229.0-238.3c125.3-4,240.8,93.8,244.2,230.1 C1266.6,1116.2,1163.7,1241.3,1028.8,1234.4z M1026.1,821.0c-101.6-3.4-181.8,76.2-183.1,187.7 c-1.0,75.4,77.6,172,176.8,174.4c104.5,2.3,189.6-86.1,189.8-181.3 C1209.3,894.1,1109.8,815.7,1026.1,821.0z"/></g><rect x="906.5" y="978.9" transform="matrix(-0.9 -0.2 0.2 -0.9 1746.4 2253.4)" fill="currentColor" width="242.6" height="55.7"/>',
  },
  outpost: {
    attributes: {
      viewBox: "-30.0 -30.0 1020.0 1020.0",
      stroke: "currentColor",
      "stroke-width": "30.0",
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
    },
    markup:
      '<g id="Layer_4"><g><path fill="currentColor" d="M925,35v890H35V35H925 M960,0H0v960h960V0L960,0z"/></g><rect x="157" y="357" fill="currentColor" width="90" height="188"/><rect x="272" y="357" fill="currentColor" width="90" height="188"/><rect x="388" y="357" fill="currentColor" width="90" height="188"/><rect x="503" y="357" fill="currentColor" width="90" height="188"/><line fill="none" stroke="currentColor" stroke-width="60.0" stroke-miterlimit="10" x1="243" y1="444" x2="621" y2="444"/><line fill="none" stroke="currentColor" stroke-width="60.0" stroke-miterlimit="10" x1="705" y1="60" x2="705" y2="370"/><line fill="none" stroke="currentColor" stroke-width="60.0" stroke-miterlimit="10" x1="658" y1="60" x2="658" y2="106"/><line fill="none" stroke="currentColor" stroke-width="60.0" stroke-miterlimit="10" x1="752" y1="60" x2="752" y2="106"/><g><path fill="currentColor" d="M766,400v329h-43.7L647,654.9V400H766 M796,370H617v297.5l93,91.5h86V370L796,370z"/></g><line fill="none" stroke="currentColor" stroke-width="60.0" stroke-miterlimit="10" x1="710" y1="269" x2="760" y2="269"/><line fill="none" stroke="currentColor" stroke-width="60.0" stroke-miterlimit="10" x1="760" y1="221" x2="760" y2="308"/><line fill="none" stroke="currentColor" stroke-width="60.0" stroke-linejoin="bevel" stroke-miterlimit="10" x1="781" y1="738" x2="781" y2="883"/></g>',
  },
  megaship: {
    attributes: {
      viewBox: "-61.2 92.3 2127.6 1882.0",
      stroke: "currentColor",
      "stroke-width": "114.7",
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
    },
    markup:
      '<g><path fill="currentColor" d="M1256,1859.6H749.3c-3.2,0-6.1-1.7-7.7-4.5l-688-1194.6c-1.6-2.7-1.6-6.2,0-8.9 l253.3-440c1.6-2.7,4.5-4.5,7.7-4.5h1376c3.2,0,6.1,1.7,7.8,4.5l253.3,440c1.6,2.7,1.6,6.2-0.0,8.9 l-688,1194.6C1262.1,1857.9,1259.2,1859.6,1256,1859.6z M754.5,1841.6h496.2L1933.6,656l-248.1-431H319.8 L71.7,656L754.5,1841.6z"/></g><g><g><rect x="840" y="862.6" fill="currentColor" width="341.3" height="72"/></g><g><path fill="currentColor" d="M1010.6,1207.7c-150.9,9.0-312.8-128-312.2-311.2c0.5-172.8,145.3-311.7,314.9-311.4 c173.8,0.2,310.9,152,313.0,309.8C1328.5,1063.4,1170.6,1219.4,1010.6,1207.7z M756,896 c-9.8,135.7,116.5,258.9,252.8,258.9c144.5,0,262.9-116.2,262.1-259.4 c-0.8-141.6-121.3-254.1-256-255.4C863.2,638.1,746.6,770.4,756,896z"/></g><g><path fill="currentColor" d="M1002.9,1639.4c-75.0,0-142.2-38.7-179.7-103.6L362.8,738.3 c-37.5-64.8-37.5-142.4-0.0-207.4C400.3,465.8,467.5,427,542.6,427H1463.2 c74.9,0,142.1,38.7,179.6,103.6c37.5,64.9,37.6,142.6,0.1,207.7l-460.2,797.3 C1145.1,1600.6,1077.9,1639.4,1002.9,1639.4z M542.6,445c-68.5,0-129.9,35.4-164.2,94.9 c-34.2,59.3-34.2,130.1,0.0,189.4l460.2,797.3c34.3,59.2,95.6,94.6,164.2,94.6 s129.8-35.4,164.2-94.7l460.2-797.3c34.2-59.4,34.1-130.3-0.1-189.7 C1592.9,480.3,1531.6,445,1463.2,445H542.6z"/></g></g>',
  },
  planetaryPort: {
    attributes: { viewBox: "0 0 739.463 606.576" },
    markup:
      '<rect y="546.5" fill="currentColor" width="739.4" height="60"/><g><path fill="currentColor" d="M307.8,467v79.5h-193V467H307.8 M367.8,407h-60h-193h-60v60v79.5v60h60h193h60v-60V467V407 L367.8,407z"/></g><g><path fill="currentColor" d="M609.8,360v186.5h-242V360H609.8 M669.8,300h-362v306.5h362V300L669.8,300z"/></g><line fill="none" stroke="currentColor" stroke-width="60" stroke-miterlimit="10" x1="181.8" y1="242" x2="321.8" y2="242"/><line fill="none" stroke="currentColor" stroke-width="60" stroke-miterlimit="10" x1="181.8" y1="134" x2="321.8" y2="134"/><line fill="none" stroke="currentColor" stroke-width="60" stroke-miterlimit="10" x1="515.8" y1="439" x2="656.8" y2="439"/><polygon fill="currentColor" points="228.8,423.2 228.8,60 376.8,60 376.8,304.6 436.8,304.6 436.8,0 168.8,0 168.8,423.2"/>',
  },
  settlement: {
    attributes: { viewBox: "0 0 630 434.667" },
    markup:
      '<g><path fill="currentColor" d="M304,232.6v152H87.3v-152H304 M354,182.6H37.3v252H354V182.6L354,182.6z"/></g><g><polygon fill="currentColor" points="630,384.6 0,384.6 0,434.6 630,434.6 630,384.6"/></g><g><path fill="currentColor" d="M557.3,272.6v112H354v-112H557.3 M607.3,222.6h-50H354h-50v50v112v50h50h203.3h50v-50v-112 V222.6L607.3,222.6z"/></g><line fill="none" stroke="currentColor" stroke-width="50" stroke-miterlimit="10" x1="534.6" y1="238.6" x2="534.6" y2="0"/><line fill="none" stroke="currentColor" stroke-width="50" stroke-miterlimit="10" x1="416.6" y1="238.6" x2="416.6" y2="112.6"/>',
  },
  dodec: {
    attributes: OWN_ATTRIBUTES,
    markup:
      '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12.00 16.20L8.01 13.30L9.53 8.60L14.47 8.60L15.99 13.30zM12.00 16.20L12.00 18.40L16.50 19.79M12.00 18.40L7.50 19.79M8.01 13.30L5.91 13.98L5.98 18.69M5.91 13.98L3.20 10.13M9.53 8.60L8.24 6.82L3.78 8.34M8.24 6.82L11.06 3.05M14.47 8.60L15.76 6.82L12.94 3.05M15.76 6.82L20.22 8.34M15.99 13.30L18.09 13.98L20.80 10.13M18.09 13.98L18.02 18.69M10.6 12h2.8"/>',
  },
  fleetCarrier: { attributes: OWN_ATTRIBUTES, markup: '<path d="M2 15h20l-2 3H5zM13 15V9h3v6M14.5 9V6M5 15v-2h6v2"/>' },
  squadronCarrier: {
    attributes: OWN_ATTRIBUTES,
    markup: '<path d="M2 15h20l-2 3H5zM13 15V9h3v6M14.5 9V5l3 1-3 1M5 15v-2h6v2"/>',
  },
  installation: {
    attributes: OWN_ATTRIBUTES,
    markup:
      '<path d="M5 5l4.5 4.5M19 5l-4.5 4.5M5 19l4.5-4.5M19 19l-4.5-4.5M3.5 6.5l3-3M17.5 3.5l3 3M3.5 17.5l3 3M17.5 20.5l3-3M12 8.5l3.5 3.5-3.5 3.5L8.5 12z"/>',
  },
  planetaryOutpost: { attributes: OWN_ATTRIBUTES, markup: '<path d="M3 19h18M5 19l2-3h5l2 3M15 19v-4h4v4M17 15v-3"/>' },
  constructionDepot: {
    attributes: OWN_ATTRIBUTES,
    markup: '<path d="M4 20h16M7 20V5h11v4M16 9h4v3h-4zM7 9l4-4M10 20v-4h5v4"/>',
  },
};

/** Icons already parsed: each one is parsed once, then cloned. */
const parsed = new Map<StationKind, SVGSVGElement>();

function iconOf(kind: StationKind): SVGSVGElement {
  let svg = parsed.get(kind);
  if (!svg) {
    const { attributes, markup } = STATION_ICONS[kind];
    const source = new DOMParser().parseFromString(`<svg xmlns="${SVG_NAMESPACE}">${markup}</svg>`, "image/svg+xml");
    svg = document.createElementNS(SVG_NAMESPACE, "svg");
    for (const [name, value] of Object.entries(attributes)) svg.setAttribute(name, value);
    svg.append(...Array.from(source.documentElement.childNodes, (node) => document.importNode(node, true)));
    svg.setAttribute("class", "station-icon");
    svg.setAttribute("role", "img");
    parsed.set(kind, svg);
  }
  return svg.cloneNode(true) as SVGSVGElement;
}

/**
 * The icon of a station from its type as the journal or Spansh writes it ("Orbis Starport"),
 * with that type as its tooltip; null when the type is unknown.
 */
export function stationIcon(type: unknown): SVGSVGElement | null {
  const kind = stationKind(type);
  if (!kind) return null;
  const svg = iconOf(kind);
  const title = document.createElementNS(SVG_NAMESPACE, "title");
  title.textContent = String(type);
  svg.prepend(title);
  svg.setAttribute("aria-label", String(type));
  return svg;
}
