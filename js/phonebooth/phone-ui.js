/**
 * phone-ui.js
 * Phone Booth UI — classic "Directory Enquiries" amber-phosphor interface.
 * Three tabs: LOOKUP (number → location/carrier), BREACH CHECK, SPAM GUARD.
 *
 * Public API:
 *   showPhoneUI(onHangup)   — mount overlay, GSAP entrance + ring SFX
 *   hidePhoneUI(onComplete) — GSAP exit, then calls onComplete
 */

import { sfx } from '../audio/audio-manager.js';

// ── Country dial-code table ───────────────────────────────────────────────────

const COUNTRY_CODES = {
  '1':   { name: 'United States / Canada', region: 'North America' },
  '7':   { name: 'Russia / Kazakhstan',    region: 'Europe / Asia' },
  '20':  { name: 'Egypt',                  region: 'Africa' },
  '27':  { name: 'South Africa',           region: 'Africa' },
  '30':  { name: 'Greece',                 region: 'Europe' },
  '31':  { name: 'Netherlands',            region: 'Europe' },
  '32':  { name: 'Belgium',                region: 'Europe' },
  '33':  { name: 'France',                 region: 'Europe' },
  '34':  { name: 'Spain',                  region: 'Europe' },
  '36':  { name: 'Hungary',                region: 'Europe' },
  '39':  { name: 'Italy',                  region: 'Europe' },
  '40':  { name: 'Romania',                region: 'Europe' },
  '41':  { name: 'Switzerland',            region: 'Europe' },
  '43':  { name: 'Austria',                region: 'Europe' },
  '44':  { name: 'United Kingdom',         region: 'Europe' },
  '45':  { name: 'Denmark',                region: 'Europe' },
  '46':  { name: 'Sweden',                 region: 'Europe' },
  '47':  { name: 'Norway',                 region: 'Europe' },
  '48':  { name: 'Poland',                 region: 'Europe' },
  '49':  { name: 'Germany',                region: 'Europe' },
  '51':  { name: 'Peru',                   region: 'South America' },
  '52':  { name: 'Mexico',                 region: 'North America' },
  '54':  { name: 'Argentina',              region: 'South America' },
  '55':  { name: 'Brazil',                 region: 'South America' },
  '56':  { name: 'Chile',                  region: 'South America' },
  '57':  { name: 'Colombia',               region: 'South America' },
  '58':  { name: 'Venezuela',              region: 'South America' },
  '60':  { name: 'Malaysia',               region: 'Asia' },
  '61':  { name: 'Australia',              region: 'Oceania' },
  '62':  { name: 'Indonesia',              region: 'Asia' },
  '63':  { name: 'Philippines',            region: 'Asia' },
  '64':  { name: 'New Zealand',            region: 'Oceania' },
  '65':  { name: 'Singapore',              region: 'Asia' },
  '66':  { name: 'Thailand',               region: 'Asia' },
  '81':  { name: 'Japan',                  region: 'Asia' },
  '82':  { name: 'South Korea',            region: 'Asia' },
  '84':  { name: 'Vietnam',                region: 'Asia' },
  '86':  { name: 'China',                  region: 'Asia' },
  '90':  { name: 'Turkey',                 region: 'Europe / Asia' },
  '91':  { name: 'India',                  region: 'Asia' },
  '92':  { name: 'Pakistan',               region: 'Asia' },
  '93':  { name: 'Afghanistan',            region: 'Asia' },
  '94':  { name: 'Sri Lanka',              region: 'Asia' },
  '95':  { name: 'Myanmar',                region: 'Asia' },
  '98':  { name: 'Iran',                   region: 'Asia' },
  '212': { name: 'Morocco',                region: 'Africa' },
  '213': { name: 'Algeria',                region: 'Africa' },
  '216': { name: 'Tunisia',                region: 'Africa' },
  '218': { name: 'Libya',                  region: 'Africa' },
  '220': { name: 'Gambia',                 region: 'Africa' },
  '221': { name: 'Senegal',                region: 'Africa' },
  '222': { name: 'Mauritania',             region: 'Africa' },
  '223': { name: 'Mali',                   region: 'Africa' },
  '224': { name: 'Guinea',                 region: 'Africa' },
  '225': { name: "Côte d'Ivoire",          region: 'Africa' },
  '226': { name: 'Burkina Faso',           region: 'Africa' },
  '227': { name: 'Niger',                  region: 'Africa' },
  '228': { name: 'Togo',                   region: 'Africa' },
  '229': { name: 'Benin',                  region: 'Africa' },
  '230': { name: 'Mauritius',              region: 'Africa' },
  '231': { name: 'Liberia',                region: 'Africa' },
  '232': { name: 'Sierra Leone',           region: 'Africa' },
  '233': { name: 'Ghana',                  region: 'Africa' },
  '234': { name: 'Nigeria',                region: 'Africa' },
  '235': { name: 'Chad',                   region: 'Africa' },
  '236': { name: 'Central African Republic', region: 'Africa' },
  '237': { name: 'Cameroon',               region: 'Africa' },
  '238': { name: 'Cape Verde',             region: 'Africa' },
  '239': { name: 'São Tomé and Príncipe',  region: 'Africa' },
  '240': { name: 'Equatorial Guinea',      region: 'Africa' },
  '241': { name: 'Gabon',                  region: 'Africa' },
  '242': { name: 'Republic of the Congo',  region: 'Africa' },
  '243': { name: 'DR Congo',               region: 'Africa' },
  '244': { name: 'Angola',                 region: 'Africa' },
  '245': { name: 'Guinea-Bissau',          region: 'Africa' },
  '246': { name: 'British Indian Ocean Territory', region: 'Africa' },
  '248': { name: 'Seychelles',             region: 'Africa' },
  '249': { name: 'Sudan',                  region: 'Africa' },
  '250': { name: 'Rwanda',                 region: 'Africa' },
  '251': { name: 'Ethiopia',               region: 'Africa' },
  '252': { name: 'Somalia',                region: 'Africa' },
  '253': { name: 'Djibouti',               region: 'Africa' },
  '254': { name: 'Kenya',                  region: 'Africa' },
  '255': { name: 'Tanzania',               region: 'Africa' },
  '256': { name: 'Uganda',                 region: 'Africa' },
  '257': { name: 'Burundi',                region: 'Africa' },
  '258': { name: 'Mozambique',             region: 'Africa' },
  '260': { name: 'Zambia',                 region: 'Africa' },
  '261': { name: 'Madagascar',             region: 'Africa' },
  '262': { name: 'Réunion / Mayotte',      region: 'Africa' },
  '263': { name: 'Zimbabwe',               region: 'Africa' },
  '264': { name: 'Namibia',                region: 'Africa' },
  '265': { name: 'Malawi',                 region: 'Africa' },
  '266': { name: 'Lesotho',                region: 'Africa' },
  '267': { name: 'Botswana',               region: 'Africa' },
  '268': { name: 'Eswatini',               region: 'Africa' },
  '269': { name: 'Comoros',                region: 'Africa' },
  '290': { name: 'Saint Helena',           region: 'Africa' },
  '291': { name: 'Eritrea',                region: 'Africa' },
  '297': { name: 'Aruba',                  region: 'Caribbean' },
  '298': { name: 'Faroe Islands',          region: 'Europe' },
  '299': { name: 'Greenland',              region: 'North America' },
  '350': { name: 'Gibraltar',              region: 'Europe' },
  '351': { name: 'Portugal',               region: 'Europe' },
  '352': { name: 'Luxembourg',             region: 'Europe' },
  '353': { name: 'Ireland',                region: 'Europe' },
  '354': { name: 'Iceland',                region: 'Europe' },
  '355': { name: 'Albania',                region: 'Europe' },
  '356': { name: 'Malta',                  region: 'Europe' },
  '357': { name: 'Cyprus',                 region: 'Europe' },
  '358': { name: 'Finland',                region: 'Europe' },
  '359': { name: 'Bulgaria',               region: 'Europe' },
  '370': { name: 'Lithuania',              region: 'Europe' },
  '371': { name: 'Latvia',                 region: 'Europe' },
  '372': { name: 'Estonia',                region: 'Europe' },
  '373': { name: 'Moldova',                region: 'Europe' },
  '374': { name: 'Armenia',                region: 'Asia' },
  '375': { name: 'Belarus',                region: 'Europe' },
  '376': { name: 'Andorra',                region: 'Europe' },
  '377': { name: 'Monaco',                 region: 'Europe' },
  '378': { name: 'San Marino',             region: 'Europe' },
  '380': { name: 'Ukraine',                region: 'Europe' },
  '381': { name: 'Serbia',                 region: 'Europe' },
  '382': { name: 'Montenegro',             region: 'Europe' },
  '385': { name: 'Croatia',                region: 'Europe' },
  '386': { name: 'Slovenia',               region: 'Europe' },
  '387': { name: 'Bosnia and Herzegovina', region: 'Europe' },
  '389': { name: 'North Macedonia',        region: 'Europe' },
  '420': { name: 'Czech Republic',         region: 'Europe' },
  '421': { name: 'Slovakia',               region: 'Europe' },
  '423': { name: 'Liechtenstein',          region: 'Europe' },
  '500': { name: 'Falkland Islands',       region: 'South America' },
  '501': { name: 'Belize',                 region: 'Central America' },
  '502': { name: 'Guatemala',              region: 'Central America' },
  '503': { name: 'El Salvador',            region: 'Central America' },
  '504': { name: 'Honduras',               region: 'Central America' },
  '505': { name: 'Nicaragua',              region: 'Central America' },
  '506': { name: 'Costa Rica',             region: 'Central America' },
  '507': { name: 'Panama',                 region: 'Central America' },
  '508': { name: 'Saint Pierre and Miquelon', region: 'North America' },
  '509': { name: 'Haiti',                  region: 'Caribbean' },
  '590': { name: 'Guadeloupe',             region: 'Caribbean' },
  '591': { name: 'Bolivia',                region: 'South America' },
  '592': { name: 'Guyana',                 region: 'South America' },
  '593': { name: 'Ecuador',                region: 'South America' },
  '594': { name: 'French Guiana',          region: 'South America' },
  '595': { name: 'Paraguay',               region: 'South America' },
  '596': { name: 'Martinique',             region: 'Caribbean' },
  '597': { name: 'Suriname',               region: 'South America' },
  '598': { name: 'Uruguay',                region: 'South America' },
  '599': { name: 'Netherlands Antilles',   region: 'Caribbean' },
  '670': { name: 'East Timor',             region: 'Asia' },
  '672': { name: 'Norfolk Island',         region: 'Oceania' },
  '673': { name: 'Brunei',                 region: 'Asia' },
  '674': { name: 'Nauru',                  region: 'Oceania' },
  '675': { name: 'Papua New Guinea',       region: 'Oceania' },
  '676': { name: 'Tonga',                  region: 'Oceania' },
  '677': { name: 'Solomon Islands',        region: 'Oceania' },
  '678': { name: 'Vanuatu',                region: 'Oceania' },
  '679': { name: 'Fiji',                   region: 'Oceania' },
  '680': { name: 'Palau',                  region: 'Oceania' },
  '685': { name: 'Samoa',                  region: 'Oceania' },
  '686': { name: 'Kiribati',               region: 'Oceania' },
  '689': { name: 'French Polynesia',       region: 'Oceania' },
  '690': { name: 'Tokelau',                region: 'Oceania' },
  '691': { name: 'Micronesia',             region: 'Oceania' },
  '692': { name: 'Marshall Islands',       region: 'Oceania' },
  '850': { name: 'North Korea',            region: 'Asia' },
  '852': { name: 'Hong Kong',              region: 'Asia' },
  '853': { name: 'Macau',                  region: 'Asia' },
  '855': { name: 'Cambodia',               region: 'Asia' },
  '856': { name: 'Laos',                   region: 'Asia' },
  '880': { name: 'Bangladesh',             region: 'Asia' },
  '886': { name: 'Taiwan',                 region: 'Asia' },
  '960': { name: 'Maldives',               region: 'Asia' },
  '961': { name: 'Lebanon',                region: 'Asia' },
  '962': { name: 'Jordan',                 region: 'Asia' },
  '963': { name: 'Syria',                  region: 'Asia' },
  '964': { name: 'Iraq',                   region: 'Asia' },
  '965': { name: 'Kuwait',                 region: 'Asia' },
  '966': { name: 'Saudi Arabia',           region: 'Asia' },
  '967': { name: 'Yemen',                  region: 'Asia' },
  '968': { name: 'Oman',                   region: 'Asia' },
  '970': { name: 'Palestinian Territory',  region: 'Asia' },
  '971': { name: 'United Arab Emirates',   region: 'Asia' },
  '972': { name: 'Israel',                 region: 'Asia' },
  '973': { name: 'Bahrain',                region: 'Asia' },
  '974': { name: 'Qatar',                  region: 'Asia' },
  '975': { name: 'Bhutan',                 region: 'Asia' },
  '976': { name: 'Mongolia',               region: 'Asia' },
  '977': { name: 'Nepal',                  region: 'Asia' },
  '992': { name: 'Tajikistan',             region: 'Asia' },
  '993': { name: 'Turkmenistan',           region: 'Asia' },
  '994': { name: 'Azerbaijan',             region: 'Asia' },
  '995': { name: 'Georgia',                region: 'Asia' },
  '996': { name: 'Kyrgyzstan',             region: 'Asia' },
  '998': { name: 'Uzbekistan',             region: 'Asia' },
};

// ── US/Canada area code → city/state ─────────────────────────────────────────

const US_AREA_CODES = {
  '201':'New Jersey','202':'Washington D.C.','203':'Connecticut',
  '204':'Manitoba, Canada','205':'Alabama (N)','206':'Seattle, WA',
  '207':'Maine','208':'Idaho','209':'Central California',
  '210':'San Antonio, TX','212':'Manhattan, NY','213':'Los Angeles, CA',
  '214':'Dallas, TX','215':'Philadelphia, PA','216':'Cleveland, OH',
  '217':'Central Illinois','218':'Northern Minnesota','219':'Northern Indiana',
  '224':'Northern Illinois','225':'Baton Rouge, LA','228':'Southern Mississippi',
  '229':'SW Georgia','231':'NW Michigan','234':'NE Ohio',
  '239':'SW Florida','240':'Maryland','248':'SE Michigan',
  '251':'Southern Alabama','252':'E North Carolina','253':'Tacoma, WA',
  '254':'Central Texas','256':'N Alabama','260':'NE Indiana',
  '262':'SE Wisconsin','267':'Philadelphia, PA','269':'SW Michigan',
  '270':'W Kentucky','272':'NE Pennsylvania','276':'SW Virginia',
  '281':'Houston, TX','301':'Maryland','302':'Delaware',
  '303':'Denver, CO','304':'West Virginia','305':'Miami, FL',
  '306':'Saskatchewan, Canada','307':'Wyoming','308':'W Nebraska',
  '309':'Central Illinois','310':'Los Angeles, CA','312':'Chicago, IL',
  '313':'Detroit, MI','314':'St. Louis, MO','315':'Syracuse, NY',
  '316':'Wichita, KS','317':'Indianapolis, IN','318':'N Louisiana',
  '319':'E Iowa','320':'Central Minnesota','321':'Central Florida',
  '323':'Los Angeles, CA','325':'W Texas','330':'NE Ohio',
  '334':'S Alabama','336':'Piedmont Triad, NC','337':'SW Louisiana',
  '340':'U.S. Virgin Islands','346':'Houston, TX','347':'New York City',
  '352':'N Central Florida','360':'W Washington','361':'S Texas',
  '385':'Salt Lake City, UT','386':'N Florida','401':'Rhode Island',
  '402':'Nebraska','404':'Atlanta, GA','405':'Oklahoma City, OK',
  '406':'Montana','407':'Orlando, FL','408':'San Jose, CA',
  '409':'SE Texas','410':'Baltimore, MD','412':'Pittsburgh, PA',
  '413':'W Massachusetts','414':'Milwaukee, WI','415':'San Francisco, CA',
  '417':'S Missouri','419':'NW Ohio','423':'E Tennessee',
  '424':'Los Angeles, CA','425':'E Seattle suburbs, WA','430':'E Texas',
  '432':'Midland/Odessa, TX','434':'Charlottesville, VA','435':'S Utah',
  '440':'NE Ohio','443':'Maryland','458':'W Oregon',
  '469':'Dallas, TX','470':'Atlanta, GA','475':'S Connecticut',
  '478':'Central Georgia','479':'NW Arkansas','480':'E Phoenix, AZ',
  '484':'E Pennsylvania','501':'Central Arkansas','502':'Louisville, KY',
  '503':'Portland, OR','504':'New Orleans, LA','505':'New Mexico',
  '507':'S Minnesota','508':'Central Massachusetts','509':'E Washington',
  '510':'Oakland, CA','512':'Austin, TX','513':'Cincinnati, OH',
  '515':'Des Moines, IA','516':'Nassau County, NY','517':'Central Michigan',
  '518':'Albany, NY','520':'S Arizona','530':'N California',
  '531':'Omaha, NE','539':'Tulsa, OK','540':'NW Virginia',
  '541':'Oregon','551':'N New Jersey','559':'Fresno, CA',
  '561':'West Palm Beach, FL','562':'Long Beach, CA','563':'E Iowa',
  '567':'NW Ohio','570':'NE Pennsylvania','571':'N Virginia',
  '573':'SE Missouri','574':'N Indiana','575':'S New Mexico',
  '580':'SW Oklahoma','585':'Rochester, NY','586':'Macomb County, MI',
  '601':'S Mississippi','602':'Phoenix, AZ','603':'New Hampshire',
  '605':'South Dakota','606':'E Kentucky','607':'S New York',
  '608':'SW Wisconsin','609':'S New Jersey','610':'E Pennsylvania',
  '612':'Minneapolis, MN','614':'Columbus, OH','615':'Nashville, TN',
  '616':'Grand Rapids, MI','617':'Boston, MA','618':'S Illinois',
  '619':'San Diego, CA','620':'S Kansas','623':'W Phoenix, AZ',
  '626':'E San Gabriel Valley, CA','628':'San Francisco, CA',
  '629':'Nashville, TN','630':'Suburban Chicago, IL','631':'Suffolk County, NY',
  '636':'St. Louis suburbs, MO','641':'Central Iowa','646':'Manhattan, NY',
  '650':'San Mateo County, CA','651':'St. Paul, MN','657':'Anaheim, CA',
  '660':'N Missouri','661':'Bakersfield, CA','662':'N Mississippi',
  '667':'Baltimore, MD','669':'San Jose, CA','671':'Guam',
  '678':'Atlanta, GA','681':'West Virginia','682':'Fort Worth, TX',
  '689':'Central Florida','701':'North Dakota','702':'Las Vegas, NV',
  '703':'N Virginia','704':'Charlotte, NC','706':'N Georgia',
  '707':'N California','708':'S Chicago suburbs, IL','712':'W Iowa',
  '713':'Houston, TX','714':'Orange County, CA','715':'N Wisconsin',
  '716':'Buffalo, NY','717':'Central Pennsylvania','718':'New York City',
  '719':'S Colorado','720':'Denver, CO','724':'W Pennsylvania',
  '725':'Las Vegas, NV','726':'San Antonio, TX','727':'St. Petersburg, FL',
  '731':'W Tennessee','732':'Central New Jersey','734':'SE Michigan',
  '737':'Austin, TX','740':'SE Ohio','754':'Fort Lauderdale, FL',
  '757':'Hampton Roads, VA','760':'Riverside County, CA','762':'NE Georgia',
  '763':'NW Minneapolis suburbs, MN','765':'Central Indiana',
  '770':'Atlanta suburbs, GA','772':'Treasure Coast, FL',
  '773':'Chicago, IL','774':'SE Massachusetts','775':'W Nevada',
  '779':'N Illinois','781':'E Massachusetts','785':'N Kansas',
  '786':'Miami, FL','787':'Puerto Rico','801':'Salt Lake City, UT',
  '802':'Vermont','803':'Central South Carolina','804':'Richmond, VA',
  '805':'Santa Barbara, CA','806':'Amarillo, TX','807':'N Ontario, Canada',
  '808':'Hawaii','810':'SE Michigan','812':'S Indiana',
  '813':'Tampa, FL','814':'W Pennsylvania','815':'N Illinois',
  '816':'Kansas City, MO','817':'Fort Worth, TX','818':'San Fernando Valley, CA',
  '825':'Alberta, Canada','828':'W North Carolina','830':'S-central Texas',
  '831':'Monterey Bay, CA','832':'Houston, TX','843':'S Carolina coast',
  '845':'Hudson Valley, NY','847':'N Chicago suburbs, IL','848':'Central NJ',
  '850':'Pensacola/Tallahassee, FL','856':'S New Jersey',
  '857':'Boston, MA','858':'San Diego, CA','859':'Lexington, KY',
  '860':'Connecticut','862':'N New Jersey','863':'Central Florida',
  '864':'Upstate South Carolina','865':'Knoxville, TN','870':'E Arkansas',
  '872':'Chicago, IL','878':'Pittsburgh, PA','901':'Memphis, TN',
  '903':'E Texas','904':'Jacksonville, FL','906':'Upper Peninsula MI',
  '907':'Alaska','908':'Central NJ','909':'Inland Empire, CA',
  '910':'SE North Carolina','912':'Savannah, GA','913':'Kansas City, KS',
  '914':'Westchester County, NY','915':'El Paso, TX','916':'Sacramento, CA',
  '917':'New York City','918':'Tulsa, OK','919':'Research Triangle, NC',
  '920':'NE Wisconsin','925':'Contra Costa County, CA','928':'N Arizona',
  '929':'New York City','930':'S Indiana','931':'Central Tennessee',
  '936':'E Texas','937':'Dayton, OH','940':'Denton, TX',
  '941':'Sarasota, FL','947':'Oakland County, MI','949':'S Orange County, CA',
  '951':'Riverside County, CA','952':'SW Minneapolis suburbs, MN',
  '954':'Fort Lauderdale, FL','956':'Laredo, TX','970':'W Colorado',
  '971':'Portland, OR','972':'Dallas, TX','973':'N New Jersey',
  '978':'N Massachusetts','979':'Bryan/College Station, TX',
  '980':'Charlotte, NC','984':'Research Triangle, NC',
  '985':'SE Louisiana','989':'Central Michigan',
};

// ── Spam / scam patterns ──────────────────────────────────────────────────────

const SCAM_AREA_CODES = new Set([
  '809','876','268','473','664','649','767','784','246','869','758','784',
  '900','976','550','540', // premium rate / one-ring
]);

const SCAM_COUNTRY_CODES = {
  '234': 'Nigeria — frequently used in advance-fee (419) fraud.',
  '353': 'Ireland — occasionally spoofed in European scam calls.',
  '233': 'Ghana — used in romance scams and wire-transfer fraud.',
  '255': 'Tanzania — linked to one-ring callback schemes.',
  '252': 'Somalia — high-risk origin for international toll fraud.',
};

const KNOWN_SCAM_PREFIXES = [
  { prefix: '+1809', label: 'Caribbean toll-fraud zone', detail: 'Calling back triggers expensive international charges.' },
  { prefix: '+1876', label: 'Jamaica one-ring scam',    detail: 'Callers are billed international rates when they call back.' },
  { prefix: '+1268', label: 'Antigua scam prefix',      detail: 'Part of the Caribbean toll-fraud ring.' },
  { prefix: '+1649', label: 'Turks & Caicos scam code', detail: 'One-ring scam — do not call back.' },
  { prefix: '+1473', label: 'Grenada scam prefix',      detail: 'Caribbean toll-fraud; callers charged premium rates.' },
  { prefix: '+900',  label: 'Premium-rate (US)',         detail: 'Calls billed at premium per-minute rates.' },
  { prefix: '+976',  label: 'Premium-rate pay-per-call', detail: 'US pay-per-call service; charges apply.' },
];

// ── Major breaches that exposed phone numbers ─────────────────────────────────

const PHONE_BREACHES = [
  {
    name: 'AT&T (2024)',
    records: '73 MILLION',
    note: 'Full names, addresses, phone numbers, SSN last-4, and account passcodes exposed. AT&T confirmed the breach included call & text metadata for ~110M customers.',
    severity: 'CRITICAL',
  },
  {
    name: 'National Public Data (2024)',
    records: '2.9 BILLION',
    note: 'Aggregated public records including names, addresses, and phone numbers of US, UK, and Canadian residents. Largest consumer data leak of 2024.',
    severity: 'CRITICAL',
  },
  {
    name: 'Facebook / Meta (2021)',
    records: '533 MILLION',
    note: 'Phone numbers, names, locations, email addresses scraped from Facebook profiles. Data from 106 countries posted on a hacking forum.',
    severity: 'CRITICAL',
  },
  {
    name: 'T-Mobile (2021)',
    records: '54 MILLION',
    note: 'Names, SSNs, phone numbers, IMEI numbers, and driver license data exposed. T-Mobile settled for $500 million.',
    severity: 'HIGH',
  },
  {
    name: 'LinkedIn (2021)',
    records: '700 MILLION',
    note: 'Scraped data including phone numbers, email addresses, and professional info posted online. Covers ~92% of all LinkedIn users.',
    severity: 'HIGH',
  },
  {
    name: 'Twitter / X (2022)',
    records: '5.4 MILLION',
    note: 'Phone numbers and email addresses matched to public Twitter accounts via an API vulnerability. Data later published on breach forums.',
    severity: 'HIGH',
  },
  {
    name: 'Experian / T-Mobile (2015)',
    records: '15 MILLION',
    note: 'T-Mobile customers who applied for service had personal data (SSN, phone numbers) stolen from Experian\'s servers.',
    severity: 'HIGH',
  },
  {
    name: 'WhatsApp (2022)',
    records: '487 MILLION',
    note: 'Phone numbers from 84 countries harvested and sold. Numbers can be used for smishing, vishing, and targeted phishing.',
    severity: 'HIGH',
  },
  {
    name: 'Clubhouse (2021)',
    records: '1.3 MILLION',
    note: 'User IDs, names, and phone numbers scraped via the API and posted publicly.',
    severity: 'MEDIUM',
  },
  {
    name: 'Twilio (2022)',
    records: '1,900+ verified',
    note: 'Authy accounts and phone numbers compromised via SMS phishing attack on Twilio employees. More accounts may be at risk.',
    severity: 'MEDIUM',
  },
];

// ── Phone number parser ───────────────────────────────────────────────────────

function parseNumber(raw) {
  // Strip everything except digits and leading +
  const cleaned = raw.trim().replace(/[^\d+]/g, '');
  const digits  = cleaned.replace(/\D/g, '');

  if (digits.length < 6)  return null;

  let dialCode = null, subscriber = null, country = null;

  // Try matching longest dial code first (3 digits), then 2, then 1
  if (cleaned.startsWith('+')) {
    for (const len of [3, 2, 1]) {
      const code = digits.slice(0, len);
      if (COUNTRY_CODES[code]) {
        dialCode   = code;
        country    = COUNTRY_CODES[code];
        subscriber = digits.slice(len);
        break;
      }
    }
  } else if (digits.length === 10) {
    // Assume US/Canada NANP
    dialCode   = '1';
    country    = COUNTRY_CODES['1'];
    subscriber = digits;
  } else if (digits.startsWith('1') && digits.length === 11) {
    dialCode   = '1';
    country    = COUNTRY_CODES['1'];
    subscriber = digits.slice(1);
  } else if (digits.startsWith('00')) {
    const stripped = digits.slice(2);
    for (const len of [3, 2, 1]) {
      const code = stripped.slice(0, len);
      if (COUNTRY_CODES[code]) {
        dialCode   = code;
        country    = COUNTRY_CODES[code];
        subscriber = stripped.slice(len);
        break;
      }
    }
  }

  if (!dialCode) {
    // Unknown dial code — give partial info
    return { raw: cleaned, digits, dialCode: null, country: null, subscriber: digits, areaCode: null };
  }

  let areaCode = null;
  let localArea = null;
  if (dialCode === '1' && subscriber.length >= 3) {
    areaCode  = subscriber.slice(0, 3);
    localArea = US_AREA_CODES[areaCode] || null;
  }

  // Detect number type
  let type = 'Geographic / Landline or Mobile';
  if (dialCode === '1') {
    const exchange = subscriber.slice(3, 6);
    if (areaCode === '800' || areaCode === '888' || areaCode === '877' ||
        areaCode === '866' || areaCode === '855' || areaCode === '844' ||
        areaCode === '833' || areaCode === '822') {
      type = 'Toll-free';
    } else if (areaCode === '900' || areaCode === '976' || areaCode === '550') {
      type = 'Premium-rate';
    } else if (exchange && (exchange.startsWith('555'))) {
      type = 'Fictitious (555 block)';
    } else {
      type = 'NANP — Mobile or Landline';
    }
  }

  return { raw: cleaned, digits, dialCode, country, subscriber, areaCode, localArea, type };
}

function formatNumber(parsed) {
  if (!parsed) return '—';
  if (parsed.dialCode === '1' && parsed.subscriber.length === 10) {
    const s = parsed.subscriber;
    return `+1 (${s.slice(0,3)}) ${s.slice(3,6)}-${s.slice(6)}`;
  }
  if (parsed.dialCode === '1' && parsed.subscriber.length >= 7) {
    const s = parsed.subscriber;
    return `+1 (${s.slice(0,3)}) ${s.slice(3,6)}-${s.slice(6)}`;
  }
  return `+${parsed.dialCode} ${parsed.subscriber}`;
}

function spamCheck(parsed) {
  if (!parsed) return [];
  const flags = [];

  // NANP one-ring / toll-fraud area codes
  if (parsed.dialCode === '1' && parsed.areaCode && SCAM_AREA_CODES.has(parsed.areaCode)) {
    flags.push({
      level: 'WARN',
      label: `Area code ${parsed.areaCode} — Caribbean toll-fraud zone`,
      detail: 'Calling back numbers from this area code may trigger expensive international charges. Common in one-ring scam campaigns.',
    });
  }

  // Known scam prefixes
  const e164 = parsed.dialCode ? `+${parsed.dialCode}${parsed.subscriber}` : `+${parsed.digits}`;
  KNOWN_SCAM_PREFIXES.forEach(({ prefix, label, detail }) => {
    if (e164.startsWith(prefix)) {
      flags.push({ level: 'WARN', label, detail });
    }
  });

  // Country-level warnings
  if (parsed.dialCode && SCAM_COUNTRY_CODES[parsed.dialCode]) {
    flags.push({
      level: 'INFO',
      label: `Country risk note`,
      detail: SCAM_COUNTRY_CODES[parsed.dialCode],
    });
  }

  // Premium-rate
  if (parsed.type === 'Premium-rate') {
    flags.push({
      level: 'WARN',
      label: 'Premium-rate number',
      detail: 'Calls to this number are billed at elevated per-minute rates. Frequently used in phone scams.',
    });
  }

  return flags;
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function el(tag, cls = '', text = '') {
  const e = document.createElement(tag);
  if (cls)  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

// ── Tab renderers ─────────────────────────────────────────────────────────────

function renderLookup(content) {
  content.innerHTML = '';

  const row = el('div', 'ph-input-row');
  const lbl = el('span', 'ph-input-label', 'NUMBER:');
  const inp = el('input', 'ph-input');
  inp.type = 'tel';
  inp.placeholder = '+1 555 867 5309';
  inp.autocomplete = 'off';
  inp.spellcheck = false;
  const btn = el('button', 'ph-btn', '[ LOOKUP ]');
  row.append(lbl, inp, btn);
  content.appendChild(row);

  const out = el('div', 'ph-result-box');
  out.innerHTML = '<span class="ph-dim">Enter a phone number in E.164 format (+country code) or 10-digit NANP and press LOOKUP.</span>';
  content.appendChild(out);

  function doLookup() {
    sfx('phone-pickup');
    const parsed = parseNumber(inp.value);
    out.innerHTML = '';

    if (!parsed || parsed.digits.length < 6) {
      out.innerHTML = '<span class="ph-danger">✗  Invalid number — too short or unrecognised format.</span>';
      return;
    }

    const rows = [
      ['INPUT',    parsed.raw],
      ['E.164',    parsed.dialCode ? `+${parsed.dialCode}${parsed.subscriber}` : `+${parsed.digits}`],
      ['FORMATTED',formatNumber(parsed)],
      ['DIGITS',   parsed.digits],
      ['DIAL CODE', parsed.dialCode ? `+${parsed.dialCode}` : '— Unknown'],
      ['COUNTRY',  parsed.country ? parsed.country.name : '— Unrecognised dial code'],
      ['REGION',   parsed.country ? parsed.country.region : '—'],
    ];

    if (parsed.areaCode) {
      rows.push(['AREA CODE',  parsed.areaCode]);
      rows.push(['CITY / STATE', parsed.localArea || 'Unknown area code']);
    }
    if (parsed.type) rows.push(['TYPE', parsed.type]);

    rows.forEach(([k, v]) => {
      const r = el('div', 'ph-row');
      const kk = el('span', 'ph-row-key', k + ' :');
      const vv = el('span', 'ph-row-val', v);
      r.append(kk, vv);
      out.appendChild(r);
    });

    // Quick spam note
    const flags = spamCheck(parsed);
    if (flags.length) {
      const t = el('div', 'ph-section-title', '⚠  SPAM / SCAM INDICATORS');
      out.appendChild(t);
      flags.forEach(f => {
        const c = el('div', 'ph-spam-flag');
        c.innerHTML = `<strong>${f.label}</strong><br><span class="ph-dim">${f.detail}</span>`;
        out.appendChild(c);
      });
    } else if (parsed.dialCode) {
      const ok = el('div', 'ph-spam-clear', '✓  No known spam patterns detected for this number.');
      out.appendChild(ok);
    }
  }

  btn.addEventListener('click', doLookup);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') doLookup(); });
}

function renderBreach(content) {
  content.innerHTML = '';

  const intro = el('div', 'ph-section-title', 'KNOWN DATA BREACHES — PHONE NUMBERS EXPOSED');
  content.appendChild(intro);

  const note = el('div', 'ph-dim');
  note.style.cssText = 'font-size:11px;margin-bottom:1rem;line-height:1.55;';
  note.textContent = 'These confirmed breaches exposed phone numbers publicly. If your number is over 2 years old and you used it for any major social platform, assume it has been leaked. Check haveibeenpwned.com for email-based breach checks.';
  content.appendChild(note);

  PHONE_BREACHES.forEach(b => {
    const card = el('div', 'ph-breach-card');
    const sev  = b.severity === 'CRITICAL' ? 'ph-danger' : b.severity === 'HIGH' ? 'ph-warn' : 'ph-dim';
    card.innerHTML =
      `<div class="ph-breach-name">${b.name}</div>` +
      `<div class="ph-breach-meta">RECORDS: <span class="${sev}">${b.records}</span> &nbsp;|&nbsp; SEVERITY: <span class="${sev}">${b.severity}</span></div>` +
      `<div class="ph-breach-note">${b.note}</div>`;
    content.appendChild(card);
  });

  const footer = el('div', 'ph-dim');
  footer.style.cssText = 'font-size:10px;margin-top:1rem;line-height:1.5;';
  footer.innerHTML = 'Sources: Troy Hunt / HIBP · Krebs on Security · BleepingComputer · official breach notifications.<br>Data broker sites (Whitepages, Spokeo, BeenVerified, Intelius, Radaris) also aggregate phone numbers from public records — submit opt-out requests directly to each.';
  content.appendChild(footer);
}

function renderSpam(content) {
  content.innerHTML = '';

  const row = el('div', 'ph-input-row');
  const lbl = el('span', 'ph-input-label', 'NUMBER:');
  const inp = el('input', 'ph-input');
  inp.type = 'tel';
  inp.placeholder = '+1 809 555 0100';
  inp.autocomplete = 'off';
  const btn = el('button', 'ph-btn', '[ CHECK ]');
  row.append(lbl, inp, btn);
  content.appendChild(row);

  const out = el('div', 'ph-result-box');
  out.innerHTML = '<span class="ph-dim">Enter a number to check against known scam patterns and high-risk prefix databases.</span>';
  content.appendChild(out);

  // Static pattern guide
  const t = el('div', 'ph-section-title', 'KNOWN HIGH-RISK PATTERNS');
  content.appendChild(t);

  [
    { pattern: '+1 (809/876/268/473/649/664/767/784/246/869/758)', label: 'Caribbean one-ring / toll-fraud', detail: 'Scammers call and hang up. When you call back you are charged international premium rates.' },
    { pattern: '+1 (900 / 976 / 550)',  label: 'US premium-rate numbers', detail: 'Per-minute charges billed to your phone account. Legitimate services exist but heavily used in scams.' },
    { pattern: '+44 70xx / +44 871x',   label: 'UK personal / special-rate numbers', detail: 'Higher tariff than standard UK calls. Often used to inflate charges on callback scams.' },
    { pattern: '+234 xxx',              label: 'Nigeria advance-fee (419) fraud', detail: 'Classic "you\'ve won a prize / I need your help" scams. Never wire money based on unsolicited calls.' },
    { pattern: 'Spoofed local numbers', label: 'Neighbourhood spoofing', detail: 'Scammers fake a local area code to increase answer rates. Always verify before calling back unknown numbers.' },
    { pattern: 'Government agency numbers', label: 'IRS / HMRC / FICA impersonation', detail: 'Real government agencies do NOT call threatening immediate arrest. Hang up and verify via official websites.' },
  ].forEach(({ pattern, label, detail }) => {
    const c = el('div', 'ph-spam-flag');
    c.innerHTML = `<span class="ph-mono">${pattern}</span><br><strong style="font-size:12px;">${label}</strong><br><span class="ph-dim" style="font-size:11px;">${detail}</span>`;
    content.appendChild(c);
  });

  function doCheck() {
    sfx('phone-pickup');
    const parsed = parseNumber(inp.value);
    out.innerHTML = '';

    if (!parsed || parsed.digits.length < 6) {
      out.innerHTML = '<span class="ph-danger">✗  Invalid number.</span>';
      return;
    }

    const flags = spamCheck(parsed);
    if (flags.length === 0) {
      const ok = el('div', 'ph-spam-clear');
      ok.innerHTML = `<strong>✓  No known scam patterns detected</strong><br><span class="ph-dim" style="font-size:11px;">This number does not match any high-risk prefix or country-risk patterns in the local database. Always exercise caution with unsolicited calls.</span>`;
      out.appendChild(ok);
    } else {
      const warn = el('div', 'ph-section-title ph-warn');
      warn.textContent = `⚠  ${flags.length} RISK INDICATOR${flags.length > 1 ? 'S' : ''} FOUND`;
      out.appendChild(warn);
      flags.forEach(f => {
        const c = el('div', f.level === 'WARN' ? 'ph-spam-flag' : 'ph-result-box');
        c.innerHTML = `<strong>${f.label}</strong><br><span class="ph-dim" style="font-size:11px;">${f.detail}</span>`;
        out.appendChild(c);
      });
    }
  }

  btn.addEventListener('click', doCheck);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') doCheck(); });
}

// ── Overlay build ─────────────────────────────────────────────────────────────

let _el         = null;
let _onHangup   = null;
let _keyHandler = null;

const TABS = [
  { id: 'lookup', label: '[ LOOKUP ]',      render: renderLookup  },
  { id: 'breach', label: '[ BREACH CHECK ]', render: renderBreach  },
  { id: 'spam',   label: '[ SPAM GUARD ]',   render: renderSpam    },
];

function _build() {
  _el = el('div', 'ph-overlay');

  _el.appendChild(el('div', 'crt-scanlines'));
  _el.appendChild(el('div', 'crt-vignette'));

  // ─ Top bar ─
  const topbar = el('div', 'ph-topbar');
  const logo   = el('span', 'ph-logo', '☎ DIRECTORY ENQUIRIES');
  const sub    = el('span', 'ph-logo-sub', '// INTERNATIONAL PHONE BOOK v2.0');
  const hangup = el('button', 'ph-hangup-btn', '[ HANG UP ]');
  hangup.title = 'Exit (ESC)';
  topbar.append(logo, sub, hangup);
  _el.appendChild(topbar);

  // ─ Tabs ─
  const tabBar  = el('div', 'ph-tabs');
  const content = el('div', 'ph-content');

  let activeIdx = 0;
  const tabBtns = TABS.map((tab, i) => {
    const btn = el('button', 'ph-tab' + (i === 0 ? ' active' : ''), tab.label);
    btn.addEventListener('click', () => {
      tabBtns.forEach((b, j) => b.classList.toggle('active', j === i));
      activeIdx = i;
      sfx('pc-enter-key');
      TABS[i].render(content);
    });
    tabBar.appendChild(btn);
    return btn;
  });

  _el.appendChild(tabBar);
  _el.appendChild(content);

  TABS[0].render(content);

  // ─ Close ─
  hangup.addEventListener('click', () => _onHangup?.());

  // Keypress beep on all phone inputs
  _el.addEventListener('input', e => {
    if (e.target.matches('.ph-input')) sfx('phone-keypress');
  });

  _keyHandler = e => {
    if (e.key === 'Escape') { e.stopPropagation(); _onHangup?.(); }
  };
  window.addEventListener('keydown', _keyHandler);

  document.body.appendChild(_el);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function showPhoneUI(onHangup) {
  _onHangup = onHangup;
  sfx('phone-ring');
  _build();

  const { gsap } = window;
  _el.style.transformOrigin = 'center center';
  gsap.fromTo(_el,
    { scaleY: 0.005, opacity: 1 },
    { scaleY: 1, duration: 0.45, ease: 'power2.out',
      onComplete: () => { sfx('phone-pickup'); } }
  );
}

export function hidePhoneUI(onComplete) {
  if (!_el) { onComplete?.(); return; }
  if (_keyHandler) {
    window.removeEventListener('keydown', _keyHandler);
    _keyHandler = null;
  }

  const domEl = _el;
  _el = null;

  sfx('phone-hangup');
  const { gsap } = window;
  gsap.timeline({ onComplete: () => { domEl.remove(); onComplete?.(); } })
    .to(domEl, { scaleY: 0.005, duration: 0.28, ease: 'power2.in' })
    .to(domEl, { opacity: 0,    duration: 0.18, ease: 'power1.in' });
}
