import {
  isValidCoordinate,
  normalizeLocation,
  toLeafletLatLng,
  toMapLibreLngLat,
  resolveSafeCenter,
  cleanPolylineCoords,
  DEFAULT_MAP_CENTER,
} from '../utils/coordinates';

console.log('Testing coordinate validation and normalization:');

// 1. Valid coordinates
console.assert(isValidCoordinate(26.14, 91.73) === true, 'Valid Guwahati coords');
console.assert(isValidCoordinate(0, 0) === true, 'Equator/Prime Meridian coords');
console.assert(isValidCoordinate(-90, 180) === true, 'Bounds coords');

// 2. Invalid / undefined / NaN coordinates (should NEVER pass)
console.assert(isValidCoordinate(undefined, undefined) === false, 'undefined coords must fail');
console.assert(isValidCoordinate(null, null) === false, 'null coords must fail');
console.assert(isValidCoordinate(NaN, NaN) === false, 'NaN coords must fail');
console.assert(isValidCoordinate(26.14, undefined) === false, 'partially undefined coords must fail');
console.assert(isValidCoordinate(120, 50) === false, 'out of latitude range must fail');
console.assert(isValidCoordinate(20, 250) === false, 'out of longitude range must fail');

// 3. Normalization
const obj1 = normalizeLocation({ lat: 26.14, lng: 91.73 });
console.assert(obj1 !== null && obj1.lat === 26.14 && obj1.lng === 91.73, 'Object normalization {lat, lng}');

const obj2 = normalizeLocation({ latitude: 26.14, longitude: 91.73 });
console.assert(obj2 !== null && obj2.lat === 26.14 && obj2.lng === 91.73, 'Object normalization {latitude, longitude}');

const obj3 = normalizeLocation({ lat: undefined, lng: undefined });
console.assert(obj3 === null, 'Undefined object must normalize to null');

const arr1 = toLeafletLatLng([91.73, 26.14]); // [lon, lat]
console.assert(arr1 !== null && arr1[0] === 26.14 && arr1[1] === 91.73, 'Array conversion to Leaflet [lat, lon]');

const arrUndef = toLeafletLatLng([undefined, undefined]);
console.assert(arrUndef === null, 'Undefined array must return null');

// 4. Safe Center resolution
const center = resolveSafeCenter([
  { lat: undefined, lng: undefined },
  null,
  [NaN, NaN],
  { lat: 26.1445, lng: 91.7362 },
]);
console.assert(center[0] === 26.1445 && center[1] === 91.7362, 'Resolved fallback center successfully');

// 5. Clean Polyline coordinates
const rawPolyline = [
  [91.73, 26.14],
  [undefined, undefined],
  [NaN, 26.15],
  [91.75, 26.16],
];
const cleaned = cleanPolylineCoords(rawPolyline);
console.assert(cleaned.length === 2, 'Cleaned polyline discarded invalid points');
console.assert(cleaned[0][0] === 26.14 && cleaned[0][1] === 91.73, 'Correct Leaflet [lat, lon] order');

console.log('ALL COORDINATE VALIDATION TESTS PASSED PERFECTLY!');
