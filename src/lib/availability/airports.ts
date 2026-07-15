export interface AirportInfo {
  iata: string
  name: string
  lat: number
  lon: number
  utcOffsetMinutes: number
  hub: boolean
}

export const AIRPORTS: Readonly<Record<string, AirportInfo>> = {
  JFK: airport(
    'JFK',
    'John F. Kennedy International',
    40.64,
    -73.78,
    -300,
    true,
  ),
  LGA: airport('LGA', 'LaGuardia', 40.78, -73.87, -300, false),
  EWR: airport('EWR', 'Newark Liberty International', 40.69, -74.17, -300, false),
  ORD: airport('ORD', 'O\'Hare International', 41.98, -87.9, -360, true),
  MDW: airport('MDW', 'Chicago Midway International', 41.79, -87.75, -360, false),
  SFO: airport('SFO', 'San Francisco International', 37.62, -122.38, -480, true),
  OAK: airport('OAK', 'Oakland International', 37.72, -122.22, -480, false),
  LAX: airport('LAX', 'Los Angeles International', 33.94, -118.41, -480, true),
  SEA: airport('SEA', 'Seattle-Tacoma International', 47.45, -122.31, -480, true),
  BOS: airport('BOS', 'Boston Logan International', 42.37, -71.01, -300, false),
  MIA: airport('MIA', 'Miami International', 25.8, -80.29, -300, false),
  ATL: airport(
    'ATL',
    'Hartsfield-Jackson Atlanta International',
    33.64,
    -84.43,
    -300,
    true,
  ),
  DFW: airport('DFW', 'Dallas Fort Worth International', 32.9, -97.04, -360, true),
  DEN: airport('DEN', 'Denver International', 39.86, -104.67, -420, true),
  IAD: airport('IAD', 'Washington Dulles International', 38.95, -77.46, -300, false),
  PHX: airport('PHX', 'Phoenix Sky Harbor International', 33.44, -112.01, -420, false),
  LAS: airport('LAS', 'Harry Reid International', 36.08, -115.15, -480, false),
  SAN: airport('SAN', 'San Diego International', 32.73, -117.19, -480, false),
  AUS: airport('AUS', 'Austin-Bergstrom International', 30.2, -97.67, -360, false),
  HNL: airport('HNL', 'Daniel K. Inouye International', 21.32, -157.92, -600, false),
  LHR: airport('LHR', 'Heathrow', 51.47, -0.45, 0, true),
  LGW: airport('LGW', 'Gatwick', 51.15, -0.18, 0, false),
  STN: airport('STN', 'Stansted', 51.89, 0.24, 0, false),
  CDG: airport('CDG', 'Charles de Gaulle', 49.01, 2.55, 60, true),
  ORY: airport('ORY', 'Paris Orly', 48.73, 2.36, 60, false),
  AMS: airport('AMS', 'Amsterdam Airport Schiphol', 52.31, 4.76, 60, true),
  FRA: airport('FRA', 'Frankfurt Airport', 50.04, 8.56, 60, true),
  MUC: airport('MUC', 'Munich Airport', 48.35, 11.79, 60, true),
  ZRH: airport('ZRH', 'Zurich Airport', 47.46, 8.55, 60, false),
  MAD: airport('MAD', 'Adolfo Suárez Madrid-Barajas', 40.5, -3.57, 60, false),
  BCN: airport('BCN', 'Barcelona-El Prat', 41.3, 2.08, 60, false),
  FCO: airport('FCO', 'Rome Fiumicino', 41.8, 12.25, 60, false),
  MXP: airport('MXP', 'Milan Malpensa', 45.63, 8.72, 60, false),
  LIS: airport('LIS', 'Humberto Delgado', 38.77, -9.13, 0, false),
  DUB: airport('DUB', 'Dublin Airport', 53.43, -6.25, 0, false),
  CPH: airport('CPH', 'Copenhagen Airport', 55.62, 12.66, 60, false),
  ARN: airport('ARN', 'Stockholm Arlanda', 59.65, 17.92, 60, false),
  VIE: airport('VIE', 'Vienna International', 48.11, 16.57, 60, false),
  BER: airport('BER', 'Berlin Brandenburg', 52.37, 13.5, 60, false),
  ATH: airport('ATH', 'Athens International', 37.94, 23.94, 120, false),
  IST: airport('IST', 'Istanbul Airport', 41.28, 28.75, 180, true),
  NRT: airport('NRT', 'Narita International', 35.77, 140.39, 540, true),
  HND: airport('HND', 'Tokyo Haneda', 35.55, 139.78, 540, false),
  KIX: airport('KIX', 'Kansai International', 34.43, 135.24, 540, false),
  ICN: airport('ICN', 'Incheon International', 37.46, 126.44, 540, true),
  PEK: airport('PEK', 'Beijing Capital International', 40.08, 116.58, 480, true),
  PVG: airport('PVG', 'Shanghai Pudong International', 31.14, 121.8, 480, false),
  HKG: airport('HKG', 'Hong Kong International', 22.31, 113.91, 480, true),
  TPE: airport('TPE', 'Taiwan Taoyuan International', 25.08, 121.23, 480, false),
  SIN: airport('SIN', 'Singapore Changi', 1.36, 103.99, 480, true),
  BKK: airport('BKK', 'Suvarnabhumi', 13.69, 100.75, 420, false),
  DEL: airport('DEL', 'Indira Gandhi International', 28.56, 77.1, 330, false),
  BOM: airport(
    'BOM',
    'Chhatrapati Shivaji Maharaj International',
    19.09,
    72.87,
    330,
    false,
  ),
  SYD: airport('SYD', 'Sydney Kingsford Smith', -33.95, 151.18, 600, false),
  MEL: airport('MEL', 'Melbourne Airport', -37.67, 144.84, 600, false),
  AKL: airport('AKL', 'Auckland Airport', -37.01, 174.79, 720, false),
  DXB: airport('DXB', 'Dubai International', 25.25, 55.36, 240, true),
  DOH: airport('DOH', 'Hamad International', 25.27, 51.61, 180, true),
  TLV: airport('TLV', 'Ben Gurion', 32.0, 34.87, 120, false),
  GRU: airport(
    'GRU',
    'São Paulo-Guarulhos International',
    -23.44,
    -46.47,
    -180,
    false,
  ),
  MEX: airport('MEX', 'Mexico City International', 19.44, -99.07, -360, false),
  YYZ: airport('YYZ', 'Toronto Pearson International', 43.68, -79.63, -300, true),
  YVR: airport('YVR', 'Vancouver International', 49.19, -123.18, -480, false),
}

export function airportInfo(iata: string): AirportInfo {
  const info = AIRPORTS[iata]
  if (info === undefined) throw new Error(`Unknown airport ${iata}`)
  return info
}

function airport(
  iata: string,
  name: string,
  lat: number,
  lon: number,
  utcOffsetMinutes: number,
  hub: boolean,
): AirportInfo {
  return { iata, name, lat, lon, utcOffsetMinutes, hub }
}
