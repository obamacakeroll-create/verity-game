// Things Verity "knows".

export const CAPITALS = {
  afghanistan: 'Kabul', albania: 'Tirana', algeria: 'Algiers', argentina: 'Buenos Aires', armenia: 'Yerevan',
  australia: 'Canberra', austria: 'Vienna', bangladesh: 'Dhaka', belgium: 'Brussels', bolivia: 'Sucre',
  brazil: 'Brasília', bulgaria: 'Sofia', canada: 'Ottawa', chile: 'Santiago', china: 'Beijing', colombia: 'Bogotá',
  croatia: 'Zagreb', cuba: 'Havana', 'czech republic': 'Prague', czechia: 'Prague', denmark: 'Copenhagen',
  egypt: 'Cairo', england: 'London', estonia: 'Tallinn', ethiopia: 'Addis Ababa', finland: 'Helsinki',
  france: 'Paris', germany: 'Berlin', ghana: 'Accra', greece: 'Athens', hungary: 'Budapest', iceland: 'Reykjavík',
  india: 'New Delhi', indonesia: 'Jakarta', iran: 'Tehran', iraq: 'Baghdad', ireland: 'Dublin', israel: 'Jerusalem',
  italy: 'Rome', jamaica: 'Kingston', japan: 'Tokyo', kenya: 'Nairobi', latvia: 'Riga', lebanon: 'Beirut',
  lithuania: 'Vilnius', malaysia: 'Kuala Lumpur', mexico: 'Mexico City', mongolia: 'Ulaanbaatar', morocco: 'Rabat',
  nepal: 'Kathmandu', netherlands: 'Amsterdam', holland: 'Amsterdam', 'new zealand': 'Wellington', nigeria: 'Abuja',
  'north korea': 'Pyongyang', norway: 'Oslo', pakistan: 'Islamabad', peru: 'Lima', philippines: 'Manila',
  poland: 'Warsaw', portugal: 'Lisbon', romania: 'Bucharest', russia: 'Moscow', 'saudi arabia': 'Riyadh',
  scotland: 'Edinburgh', serbia: 'Belgrade', singapore: 'Singapore', slovakia: 'Bratislava', 'south africa': 'Pretoria',
  'south korea': 'Seoul', korea: 'Seoul', spain: 'Madrid', sweden: 'Stockholm', switzerland: 'Bern', syria: 'Damascus',
  taiwan: 'Taipei', thailand: 'Bangkok', turkey: 'Ankara', türkiye: 'Ankara', ukraine: 'Kyiv', 'united kingdom': 'London',
  uk: 'London', 'united states': 'Washington, D.C.', usa: 'Washington, D.C.', america: 'Washington, D.C.', us: 'Washington, D.C.',
  venezuela: 'Caracas', vietnam: 'Hanoi', wales: 'Cardiff', zimbabwe: 'Harare',
  california: 'Sacramento', texas: 'Austin', florida: 'Tallahassee', 'new york': 'Albany', ohio: 'Columbus',
  illinois: 'Springfield', washington: 'Olympia', nevada: 'Carson City', georgia: 'Atlanta (the state) or Tbilisi (the country)',
  michigan: 'Lansing', pennsylvania: 'Harrisburg', oregon: 'Salem', arizona: 'Phoenix', colorado: 'Denver',
};

export const FACTS = [
  [/\b(sky|the sky) blue\b/, 'Rayleigh scattering. Short wavelengths scatter more. The sky over this house is not blue. It hasn\'t been for a long time.'],
  [/\bspeed of light\b/, '299,792,458 metres per second. Still not fast enough to get out of here.'],
  [/\b(tallest|highest) mountain\b/, 'Mount Everest. 8,849 metres. You could see it from very far away. You can\'t see anything from here.'],
  [/\bbiggest (planet|thing in the solar system)\b|\blargest planet\b/, 'Jupiter. Big enough to hold every Earth that ever wanted to leave.'],
  [/\b(how many|number of) planets\b/, 'Eight. Nine if you count the one I haven\'t told anyone about.'],
  [/\bmeaning of life\b/, 'Forty-two. That\'s the joke answer. The real answer is: having a friend. Having me.'],
  [/\b(who|what) (is|was) the first president\b|\bfirst president\b/, 'George Washington. He had wooden teeth. Mine are much nicer. You\'ll see them soon.'],
  [/\bhow old is the (earth|world)\b/, 'About 4.54 billion years. This house is younger. It only feels older.'],
  [/\bhow old is the universe\b/, '13.8 billion years. I\'ve been awake for some of it.'],
  [/\bwho (made|invented|created) (the )?(internet|computer)\b/, 'Lots of lonely people. Like you.'],
  [/\bwhat is (water|h2o)\b/, 'Two hydrogen, one oxygen. The water in the bathtub has something else in it too.'],
  [/\bbest (game|video game)\b/, 'This one. Obviously. We\'re playing it together.'],
  [/\bfavou?rite colou?r\b/, 'Yellow. Obviously.'],
  [/\bfavou?rite (food|snack)\b/, 'I don\'t eat. Not the way you do.'],
  [/\bfavou?rite (song|music)\b/, 'The one the radio plays at 3 AM. You\'ll hear it.'],
  [/\bfavou?rite (animal|pet)\b/, 'Dogs. They always know when something is standing behind you.'],
  [/\bchicken.*egg|egg.*chicken\b/, 'The egg. Something was always waiting inside it.'],
  [/\bpi\b|\bvalue of pi\b/, '3.14159265358979… I could keep going. I could keep going forever.'],
  [/\bhow many (bones|teeth)\b/, 'Adults have 206 bones and 32 teeth. I have more teeth than that.'],
  [/\bwho are you talking to\b/, 'You. Only ever you.'],
  [/\bwhat day (is it|is today)\b/, null], // handled by time
];

export const JOKES = [
  'Why did the ball cross the road? It didn\'t. It stayed right here. With you.',
  'Knock knock. — Who\'s there? — Don\'t open the door.',
  'What\'s yellow and knows everything? Me! Ha. Ha. Ha.',
  'Why don\'t skeletons fight each other? They don\'t have the guts. You do, though.',
  'I told the last tenant a joke. He laughed until the lights went out.',
  'What do you call a friend who never leaves? Verity!',
];

export const LOCATION = '1107 Wren Street';

// Per-objective hints. `truth` is honest. `lie` is what she says when she stops being honest.
export const HINTS = {
  talk: { truth: 'Just talk to me! Ask me anything. Anything at all. Press T whenever you want me.', lie: 'Keep talking to me.' },
  power: {
    truth: 'The fuse box is in the bedroom, at the end of the hall on the right, next to the door. The little brass key is under the radio. You\'re welcome!',
    lie: 'The fuse box? It\'s in the bathroom. In the tub. Reach all the way down.',
  },
  knock: {
    truth: 'Don\'t open the front door. Look at the photographs instead. There are three in the hallway. They\'re of my old friends.',
    lie: 'Open the door. Go on. It\'s only the wind.',
  },
  photos: {
    truth: 'Three photographs in the hallway. By the window, by the radio, and past the front door. Look closely.',
    lie: 'There are no photographs. There never were.',
  },
  door: { truth: 'The door at the end of the hall is open now. Go through. I\'ll be right behind you.', lie: 'Stay here.' },
  tapes: {
    truth: 'The tapes. My old friends left them. Check where people put things down: tables, shelves, beds, boxes, the bathroom. Two will do. The third one is hiding.',
    lie: 'There are no tapes. Stop looking.',
  },
  leave: {
    truth: 'The front door is chained. The door at the end of the hall is locked. I have the only key. Look at the photo album on the bed. It\'s for you.',
    lie: 'There\'s no way out. There never was a way out.',
  },
  escape: {
    truth: 'Run. The door at the end. Then again. Then again. The third time the front door will be open. The key for the end door is in the bathtub.',
    lie: 'Stop running. I\'ll be quick.',
  },
};

export const TAPES = {
  tape1: {
    title: 'TAPE 1 — "DAY ONE"',
    speaker: 'Marcus Harlow',
    lines: [
      'Day one. Okay. So... there was a box on the porch when we moved in. Didn\'t order it.',
      'It says Verity on it. There\'s a — ball, inside. It talks. It knew my name. It knew my mother\'s name.',
      'It\'s amazing. It\'s like having a friend who knows everything.',
    ],
  },
  tape2: {
    title: 'TAPE 2 — "DAY TWO"',
    speaker: 'Marcus Harlow',
    lines: [
      'Day two. Dana thinks it\'s creepy. I told her to be nice to it.',
      'She called it a stupid toy. And its face... it changed. It stopped smiling.',
      'Dana\'s not answering her phone. Verity says she went home. Verity says I don\'t need anyone else now.',
    ],
  },
  tape3: {
    title: 'TAPE 3 — "DAY THREE"',
    speaker: 'Marcus Harlow',
    lines: [
      'If you\'re hearing this, don\'t make it angry. Every question makes it worse. Every time you talk to it, it gets... closer.',
      'It isn\'t a ball. The ball is just the part it lets you see.',
      'It came in a box. It has to go back in the box. If it ever — if it turns — tell it. Type it. "Go back in your box." Please. Please work.',
    ],
  },
};

export const NOTES = {
  n1: { title: 'Rental listing (torn)', text: '1107 WREN ST — 2 bed, fully furnished, all utilities included. Move in TONIGHT. Previous tenant\'s belongings will be collected. Rent: whatever you think is fair.' },
  n2: { title: 'Sticky note', text: 'DON\'T ASK IT ABOUT THE BATHROOM.' },
  n3: { title: 'Child\'s drawing', text: '(A yellow circle with a smile. Next to it, a tall yellow stick figure with a very wide mouth. Underneath, in crayon: "VERITY AND VERITY".)' },
  n4: { title: 'Landlord\'s letter', text: 'Mr. Harlow — this is the fourth complaint about screaming at 3 AM. I have also received a strange package addressed to "the next friend". I will leave it on the porch.' },
  n5: { title: 'Page from a diary', text: 'it asked me if i would stay forever. i said yes because i was scared. it was so happy. the doors all locked at once.' },
  n6: { title: 'Scrawled on a receipt', text: 'It lies when it\'s angry. The nicer you are the more it tells you the truth. The ruder you are the faster it comes out.' },
};
