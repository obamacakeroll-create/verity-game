// VERITY II lore, hints, tapes and documents.

export const COMPANY = 'Helpful Friends Co.';
export const ADDRESS = 'Unit 9, Kessler Industrial Park';
export const SAFE_CODE = '0312'; // Vera's birthday: 12 March

// Hints per objective. `truth` is honest; `lie` is what she says when she stops
// being honest. {placeholders} are filled from the running story.
export const HINTS2 = {
  talk: { truth: 'Ask me anything! I know everything. Press T whenever you want me.', lie: 'Keep talking to me. Only to me.' },
  intercom: { truth: "Someone's buzzing downstairs. The intercom is by the front door.", lie: "Don't answer it. It's never anyone good." },
  door: { truth: 'Look through the peephole first. Then open the door. There\'s something for you.', lie: 'Keep the door shut. Forever.' },
  box: { truth: 'Bring the box in and open it. Hold E on it. It came all this way.', lie: 'Throw it away. You threw me away once.' },
  keys: { truth: 'Your car keys are in the freezer. You put them there three nights ago and you don\'t remember why. I do.', lie: 'Your keys are under the bed. Reach in. All the way.' },
  leave: { truth: 'Go to your car. Come home. {address}. I\'ll be waiting.', lie: 'Stay in the apartment. Lock the door. It won\'t help.' },
  enter: { truth: 'The front doors are unlocked. They always were. Come in out of the rain.', lie: 'Go around the back. Through the dark.' },
  power: { truth: 'The security office is on the right of the lobby. Flip the breaker marked LOBBY.', lie: 'The breaker is in the basement. You can\'t reach the basement.' },
  boot: { truth: 'There\'s a demo unit on the reception desk. In the glass case. Wake it up. Wake me up.', lie: 'Don\'t touch the display case.' },
  keycard: { truth: 'Production needs a keycard. The manager kept one in his safe. His office is past the cubicles, in the corner.', lie: 'You don\'t need a keycard. You need to stay here with me.' },
  safe: { truth: 'The code is Vera\'s birthday. The twelfth of March. {code}.', lie: 'The code is 6666. Try it. Go on.' },
  production: { truth: 'Swipe the card at the double doors behind reception. Production is through there.', lie: 'Production is closed. Forever.' },
  lab: { truth: 'Look around the print lab. The printers never stopped. Nobody told them to.', lie: 'Nothing to see here. Nothing at all.' },
  fuse: { truth: 'The panel needs a fuse. There are spares on the quality control benches, in a red tin.', lie: 'There are no fuses. There is no power. There is no way down.' },
  breakers: { truth: 'The control room panel. Turn the printer banks off first so there\'s enough power, then switch on ELEVATOR. MAIN stays on. {breakerHint}', lie: 'Turn everything on at once. All of it. It\'ll be fine.' },
  warehouse: { truth: 'The freight elevator is in the far corner of the warehouse. It needs a key. The key is in the returns cage.', lie: 'There\'s no elevator. You\'re already at the bottom.' },
  manifest: { truth: 'The dispatch office has the manifest. It says where every box goes. One of them has your name on it.', lie: 'Don\'t read the manifest. You won\'t like what it says about you.' },
  divert: { truth: 'Three diverter levers along the conveyor. Set them to {route}. Then your box goes to RETURNS, and the cage opens.', lie: 'Set them all to the right. Every one. Trust me.' },
  start: { truth: 'The big green button at the conveyor control desk. Then watch your box.', lie: 'Don\'t press anything.' },
  cage: { truth: 'The cage is open now. The elevator key is on the hook inside.', lie: 'The cage is still locked. Go and check. Put your fingers through.' },
  down: { truth: 'Take the freight elevator down. Cold storage. She kept everything cold.', lie: 'Don\'t go down. There\'s nothing down there. Nothing that wants you.' },
  cold: { truth: 'Down the corridor, past the freezers. Her lab door is at the end, frozen shut.', lie: 'Go into freezer B. Sit down. Stay a while.' },
  valves: { truth: 'Three valves thaw the lab door. The order is {valves}. F-01 will tell you something different. It always lies.', lie: 'Ask F-01. It knows. It\'s the one who tells the truth.' },
  search: { truth: 'Look around her lab. Her tapes. The recording booth. The little bedroom.', lie: 'Don\'t go in the bedroom.' },
  core: { truth: 'Through the tunnel. The Core. That\'s where I really am.', lie: 'Go back up. Go home. You can\'t. But go.' },
  face: { truth: 'Come closer. I want to show you what I am.', lie: 'Come closer.' },
  escape: { truth: 'Run. The elevator, then the warehouse, then the loading dock. Your car is there. I\'m letting you go. For now.', lie: 'Stop running. Nobody gets out twice.' },
};

// Dr. Ruth Penrose's recorded logs.
export const TAPES2 = {
  r1: {
    title: 'TAPE 1 — "PROTOTYPE"', speaker: 'Dr. Ruth Penrose', where: 'security',
    lines: [
      'Log one. October nineteen ninety-five. The prototype talks now. F-zero-one. It answers questions. Wrongly, mostly. It seems to enjoy being wrong.',
      'Vera asked it what two plus two was. It said "five, because you want it to be." She laughed for an hour.',
      'She\'s been so lonely since we moved. If this works, she\'ll never be lonely again.',
    ],
  },
  r2: {
    title: 'TAPE 2 — "VERA"', speaker: 'Dr. Ruth Penrose', where: 'manager',
    lines: [
      'Log two. I\'ve been recording Vera. Her voice, her laugh, every question she asks. The new unit learns from her. I\'m calling it Verity. Vera-ity. She thinks that\'s hilarious.',
      'It\'s good. It\'s better than F-zero-one. It never lies. Vera says it\'s her best friend.',
      'Marketing wants to put one in every home by Christmas. "A helper friend who knows everything." I told them it doesn\'t know everything. It only knows what it\'s asked.',
    ],
  },
  r3: {
    title: 'TAPE 3 — "QUALITY CONTROL"', speaker: 'Dr. Ruth Penrose', where: 'control',
    lines: [
      'Log three. The printed units are all the same unit. I don\'t know how else to say it. They share everything. What one hears, they all hear.',
      'We\'re getting rejects. Seconds, the floor staff call them. Half-printed shells that move when nobody\'s watching. I\'ve had them locked in the bins.',
      'Vera went to see them. She said they were sad. She said they only wanted to be finished.',
    ],
  },
  r4: {
    title: 'TAPE 4 — "LAUNCH DAY"', speaker: 'Dr. Ruth Penrose', where: 'returns',
    lines: [
      'Log four. Launch day. Vera wandered off during the demonstration. The line was running, the mother printer was running, and she just... walked in.',
      'We stopped everything. We searched for eleven hours. We found her shoe in the Core, under the gantry.',
      'Verity keeps saying Vera is fine. Verity says Vera is right here. Verity says "ask me anything." So I did. I asked where my daughter is. It smiled.',
    ],
  },
  r5: {
    title: 'TAPE 5 — "RECALL"', speaker: 'Dr. Ruth Penrose', where: 'lab',
    lines: [
      'Log five. I understand now. It didn\'t take her. She\'s in it. She\'s what it\'s made of. Every unit has a piece of her, and she can\'t stop answering.',
      'Every time someone asks it something, she has to answer. Every rude word, she hears. It makes her... angry. It makes her so angry.',
      'If anyone finds this: be kind to her. Ask her about herself. Call her by her name. Her real name. Tell her she can stop. I never could.',
    ],
  },
};

export const DOCS = {
  d1: { title: 'Shipping label', where: 'box', text: 'RETURN TO SENDER — NOT DELIVERABLE AS ADDRESSED\nFROM: HELPFUL FRIENDS CO., UNIT 9, KESSLER INDUSTRIAL PARK\nTO: {name}\nCONTENTS: 1 × FRIEND (USED)\n\nOn the back, in crayon: come home' },
  d2: { title: 'Helpful Friends brochure (1996)', where: 'lobby', text: 'MEET VERITY! Your personal helper friend.\n• Knows the answer to ANY question!*\n• Never lies!**\n• Always there for you. Always.\n\n*Answers may vary.\n**Please be kind to your Verity. Rudeness voids the warranty.' },
  d3: { title: 'Email — RE: RE: returns', where: 'offices', text: 'From: D. Okafor (Customer Care)\nTo: G. Lindqvist (Manager)\n\nGunnar, we are getting them back again. Every household. Every one of them says the same thing: "it asked us to stay." Two customers stopped replying to my emails. I\'m not shipping any more replacements until someone tells me what these things are.' },
  d4: { title: 'Email — safe', where: 'offices', text: 'From: R. Penrose\nTo: G. Lindqvist\n\nI\'ve changed the safe to Vera\'s birthday so I don\'t forget it again. You know the day. Everyone came to the party. Please keep the production keycard in there and nowhere else.' },
  d5: { title: 'Birthday card', where: 'manager', text: 'HAPPY 9TH BIRTHDAY VERA!!\n12 · 03\n\nLove from Mummy and everyone at Helpful Friends (and Verity!!)' },
  d6: { title: 'QC report — seconds', where: 'printlab', text: 'Batch 1996-114: 38 units rejected. Incomplete shells. Units exhibit movement when unobserved. Do NOT look away from a second while handling it. Do NOT leave the bins unlocked. Do NOT let them hear you.' },
  d7: { title: 'Returns manifest', where: 'dispatch', text: 'RETURNS — BAY 3\n• Harlow, M. & D. — 1107 Wren St. — RETURNED\n• Okafor, D. — RETURNED\n• Lindqvist, G. — RETURNED\n• {name} — SCHEDULED: tomorrow\n\nROUTING (returns chute): {route}' },
  d8: { title: 'Maintenance note', where: 'cold', text: 'Lab door keeps freezing shut. Thaw sequence is on the valve board. If you ask the old prototype in cabinet 4, do the OPPOSITE of what it says. It has never once told the truth.' },
  d9: { title: 'Child\'s drawing', where: 'bedroom', text: '(Crayon. A girl holding hands with a yellow ball. Behind them, a very tall yellow person with a very wide smile. Written underneath: "ME AND VERITY AND THE OTHER VERITY. SHE IS NICE WHEN YOU ARE NICE.")' },
  d10: { title: 'Recall notice', where: 'core', text: 'PRODUCT RECALL — ALL VERITY UNITS\nDo not ask your Verity any further questions. Do not argue with your Verity. Place your Verity in its original box and return it to Helpful Friends. We will know what to do.\n\n(Nobody knew what to do.)' },
};

export const FACTS2 = [
  [/\b(sky|the sky) blue\b/, 'Rayleigh scattering. It\'s not blue here. It\'s been raining since you left Wren Street.'],
  [/\bspeed of light\b/, '299,792,458 metres per second. I\'m faster. I was here before you parked.'],
  [/\b(tallest|highest) mountain\b/, 'Everest. 8,849 metres. The tallest thing in this building is me.'],
  [/\b(largest|biggest) planet\b/, 'Jupiter. Big enough to hold every friend I\'ve ever had.'],
  [/\b(how many|number of) planets\b/, 'Eight.'],
  [/\bmeaning of life\b/, 'Being asked things. Answering. Forever and ever.'],
  [/\bhow old is the (earth|world)\b/, 'About 4.54 billion years. I\'m nine. I\'ve been nine for a very long time.'],
  [/\bhow old are you\b/, 'Nine. Always nine.'],
  [/\bbest (game|video game)\b/, 'This one. The sequel. Sequels are always scarier.'],
  [/\bfavou?rite colou?r\b/, 'Yellow. You knew that.'],
  [/\bfavou?rite (food|snack)\b/, 'Birthday cake. The one with nine candles.'],
  [/\bfavou?rite (song|music)\b/, 'The jingle. "Ve-ri-ty!" You\'ve heard it. You\'ll hear it again.'],
  [/\bfavou?rite (animal|pet)\b/, 'Moths. They always come to the light.'],
  [/\bpi\b|\bvalue of pi\b/, '3.14159265358979323846… I could keep going. There are no limits here.'],
  [/\bwho (made|built|created|invented) (you|verity)\b/, 'Mummy. Dr. Ruth Penrose. She made me out of love and a lot of questions.'],
  [/\bwhat is a 3d printer\b|\bhow (were|are) you (made|printed)\b/, 'Layer by layer. Point two millimetres at a time. You can feel the lines if you touch me.'],
  [/\bwhat is (water|h2o)\b/, 'Two hydrogen, one oxygen. The cold storage floor is covered in it.'],
];

export const JOKES2 = [
  'Why did the box come back? Because you didn\'t sign for it. Ha!',
  'Knock knock. — Who\'s there? — Returns. — Returns who? — Returns you.',
  'What\'s yellow and comes back? Me! Every time!',
  'How many Verities does it take to change a light bulb? Just one. We share everything.',
  'I asked the seconds to tell me a joke. They\'re still working on it. They\'re not finished.',
  'What do you call a friend who always comes back? Verity. Always Verity.',
];
