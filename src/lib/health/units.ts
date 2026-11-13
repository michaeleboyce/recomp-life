// Unit conversion from Apple Health's SI values to the app's lbs and miles. Pure.

const LBS_PER_KG = 2.2046226218;
const METRES_PER_MILE = 1609.344;

/** Kilograms to pounds, rounded to one decimal place. */
export function kgToLbs(kilograms: number): number {
  return Math.round(kilograms * LBS_PER_KG * 10) / 10;
}

/** Metres to miles, rounded to two decimal places. */
export function metresToMiles(metres: number): number {
  return Math.round((metres / METRES_PER_MILE) * 100) / 100;
}
