declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;

export const APP_VERSION: string =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

export const BUILD_TIME_ISO: string =
  typeof __BUILD_TIME__ !== "undefined" ? __BUILD_TIME__ : new Date().toISOString();

const _d = new Date(BUILD_TIME_ISO);
const _pad = (n: number) => String(n).padStart(2, "0");

export const BUILD_LABEL = `${_d.getUTCFullYear()}-${_pad(_d.getUTCMonth() + 1)}-${_pad(_d.getUTCDate())}-${_pad(_d.getUTCHours())}${_pad(_d.getUTCMinutes())}`;

export const BUILD_ID = Math.floor(_d.getTime() / 1000).toString(16).slice(-8);

export const PUBLISHED_DATE = _d.toLocaleDateString("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
