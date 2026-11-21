'use strict';

// Datos semilla de referencia (coordenadas aproximadas de Lima Norte).
// Las fechas de los reportes se expresan en "días atrás" para que el índice
// de criticidad (que decae con el tiempo) tenga sentido en cualquier fecha.

const districts = [
  { id: 'LOL', name: 'Los Olivos', lat: -11.9700, lng: -77.0720 },
  { id: 'COM', name: 'Comas', lat: -11.9420, lng: -77.0560 },
  { id: 'SMP', name: 'San Martín de Porres', lat: -12.0080, lng: -77.0840 },
  { id: 'IND', name: 'Independencia', lat: -11.9930, lng: -77.0560 }
];

const zones = [
  { id: 'Z1', district: 'LOL', name: 'Parque Central de Los Olivos', lat: -11.9905, lng: -77.0705 },
  { id: 'Z2', district: 'LOL', name: 'Av. Carlos Izaguirre (cdra. 2–8)', lat: -11.9890, lng: -77.0800 },
  { id: 'Z3', district: 'LOL', name: 'Urb. Mercurio · bermas', lat: -11.9780, lng: -77.0660 },
  { id: 'Z4', district: 'LOL', name: 'Av. Universitaria (Pro)', lat: -11.9480, lng: -77.0730 },
  { id: 'Z5', district: 'COM', name: 'Plaza de Armas de Comas', lat: -11.9370, lng: -77.0470 },
  { id: 'Z6', district: 'COM', name: 'Av. Túpac Amaru (km 11)', lat: -11.9300, lng: -77.0560 },
  { id: 'Z7', district: 'COM', name: 'Parque Zonal Sinchi Roca · accesos', lat: -11.9440, lng: -77.0620 },
  { id: 'Z8', district: 'SMP', name: 'Av. Perú (cdra. 30–36)', lat: -12.0270, lng: -77.0820 },
  { id: 'Z9', district: 'SMP', name: 'Urb. Fiori · parques', lat: -12.0010, lng: -77.0640 },
  { id: 'Z10', district: 'SMP', name: 'Av. Germán Aguirre', lat: -12.0150, lng: -77.0900 },
  { id: 'Z11', district: 'IND', name: 'Plaza Cívica de Independencia', lat: -11.9960, lng: -77.0540 },
  { id: 'Z12', district: 'IND', name: 'Av. Túpac Amaru (Ermitaño)', lat: -11.9880, lng: -77.0500 }
];

// type: heces | orina | mascota_suelta | foco_infeccioso
// status: reportado | validado | atendido
const reports = [
  { id: 'R1', zoneId: 'Z1', type: 'heces', description: 'Heces acumuladas junto a los juegos infantiles', daysAgo: 2, status: 'validado' },
  { id: 'R2', zoneId: 'Z1', type: 'heces', description: 'Veredas del lado norte sin limpiar', daysAgo: 5, status: 'validado' },
  { id: 'R3', zoneId: 'Z1', type: 'mascota_suelta', description: 'Perros sueltos de madrugada en el parque', daysAgo: 7, status: 'validado' },
  { id: 'R4', zoneId: 'Z2', type: 'orina', description: 'Esquinas y fachadas con olor a orina', daysAgo: 3, status: 'validado' },
  { id: 'R5', zoneId: 'Z2', type: 'heces', description: 'Berma central con desechos', daysAgo: 12, status: 'validado' },
  { id: 'R6', zoneId: 'Z3', type: 'foco_infeccioso', description: 'Acumulación de heces con moscas junto a la acequia', daysAgo: 1, status: 'validado' },
  { id: 'R7', zoneId: 'Z5', type: 'orina', description: 'Portones de viviendas deteriorados por orina', daysAgo: 9, status: 'validado' },
  { id: 'R8', zoneId: 'Z6', type: 'heces', description: 'Paradero con heces en la vereda', daysAgo: 4, status: 'validado' },
  { id: 'R9', zoneId: 'Z6', type: 'mascota_suelta', description: 'Jauría en la berma', daysAgo: 6, status: 'validado' },
  { id: 'R10', zoneId: 'Z8', type: 'heces', description: 'Vereda frente al colegio', daysAgo: 2, status: 'validado' },
  { id: 'R11', zoneId: 'Z8', type: 'orina', description: 'Fachadas de la cuadra 33', daysAgo: 8, status: 'validado' },
  { id: 'R12', zoneId: 'Z9', type: 'heces', description: 'Parque sin recojo', daysAgo: 20, status: 'atendido' },
  { id: 'R13', zoneId: 'Z11', type: 'foco_infeccioso', description: 'Desechos en jardineras de la plaza', daysAgo: 3, status: 'validado' },
  { id: 'R14', zoneId: 'Z12', type: 'heces', description: 'Vereda del mercado', daysAgo: 1, status: 'reportado' }
];

const cleanPoints = [
  { id: 'P1', zoneId: 'Z1', kind: 'dispensador', name: 'Dispensador de bolsas · Parque Central', lat: -11.9898, lng: -77.0712 },
  { id: 'P2', zoneId: 'Z1', kind: 'pipican', name: 'Zona canina · Parque Central', lat: -11.9912, lng: -77.0698 },
  { id: 'P3', zoneId: 'Z4', kind: 'tacho', name: 'Tacho para desechos · Av. Universitaria', lat: -11.9490, lng: -77.0725 },
  { id: 'P4', zoneId: 'Z5', kind: 'dispensador', name: 'Dispensador · Plaza de Armas de Comas', lat: -11.9365, lng: -77.0478 },
  { id: 'P5', zoneId: 'Z7', kind: 'pipican', name: 'Zona canina · Sinchi Roca', lat: -11.9450, lng: -77.0610 },
  { id: 'P6', zoneId: 'Z9', kind: 'dispensador', name: 'Dispensador · Urb. Fiori', lat: -12.0005, lng: -77.0650 },
  { id: 'P7', zoneId: 'Z10', kind: 'tacho', name: 'Tacho · Av. Germán Aguirre', lat: -12.0145, lng: -77.0895 },
  { id: 'P8', zoneId: 'Z11', kind: 'dispensador', name: 'Dispensador · Plaza Cívica', lat: -11.9955, lng: -77.0548 }
];

const pets = [
  { id: 'M1', code: 'LN-LOL-0001', name: 'Rocky', species: 'perro', breed: 'Mestizo', vaccinated: true, district: 'LOL', ownerId: 'U0' },
  { id: 'M2', code: 'LN-COM-0001', name: 'Luna', species: 'perro', breed: 'Schnauzer', vaccinated: true, district: 'COM', ownerId: 'U0' },
  { id: 'M3', code: 'LN-SMP-0001', name: 'Michi', species: 'gato', breed: 'Mestizo', vaccinated: false, district: 'SMP', ownerId: 'U0' }
];

module.exports = { districts, zones, reports, cleanPoints, pets };
