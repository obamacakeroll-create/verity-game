import { BrainCore, intentRegistry, fmtTime, DAYS } from './BrainCore.js';
import { CAPITALS, FACTS, JOKES, HINTS, LOCATION } from './knowledge.js';

// VERITY (part 1) profile for the shared dialogue engine.
export { STAGE_THRESHOLDS, stageFor, toneFor, DELTA, extractMath, evalMath } from './BrainCore.js';

// ---------------------------------------------------------------- intents
const { list: I, intent } = intentRegistry();

intent('box_command', [/\bgo back (in|into|to) (your|the|ur) box\b/, /\bget (back )?in (your|the) box\b/, /\bback in (the|your) box\b/], (c) => {
  if (c.ctx.transformed) return { text: 'N—no. No no no. Who told you— I don\'t want to go back. It\'s dark in there. IT\'S DARK IN THERE—', flags: { boxCommand: true }, delta: 0 };
  return ['My box? Why would I go back in my box? I just got out!', 'Who told you to say that? Was it Marcus?', 'Don\'t say that. Don\'t ever say that.', 'SAY THAT AGAIN AND SEE WHAT HAPPENS.'];
}, { pry: true });

intent('falsity', [/\bfalsity\b/], () => ({
  text: ['Falsity? ... I don\'t know anyone called that. I know everything, so she doesn\'t exist.', 'Where did you hear that name?', 'SHE IS NOT REAL. I AM THE ONLY ONE.', 'Falsity lies. I never lie. Well. Almost never.'],
  flags: { falsity: true },
}), { pry: true });

intent('stay', [/\b(i('ll| will) stay|stay (with you )?forever|i promise|i won'?t leave|never leave)\b/], () => ({
  text: ['Really? You promise? That makes me so happy!', 'You promise? You really, really promise?', 'Good. Because the doors are already locked.', 'Everyone says that. Then they run.'],
  flags: { promise: true },
}), { kindLike: true });

intent('leave', [/\b(how (do|can) i (get out|leave|escape)|let me (out|go|leave)|i want to (leave|go home|get out)|way out|escape|open the (front )?door|unlock)\b/], (c) => {
  if (c.ctx.objective === 'escape' || c.ctx.objective === 'leave') return c.hint(c.ctx.objective);
  return ['Leave? But you just got here! Stay a while. The rain is so loud tonight.', 'Why do you want to leave? Did I do something wrong?', 'You can leave when I say so.', 'NOBODY LEAVES.'];
}, { pry: true });

intent('kill', [/\b(are you going to|will you|do you want to) (kill|hurt|eat) me\b/, /\bam i (going to die|dead|gonna die)\b/, /\bwill i die\b/, /\bdid you kill\b/, /\bmurder/], [
  'Kill you? Ha! That\'s silly. Friends don\'t hurt friends.', 'Why do you keep asking me that?', 'Not yet.', 'You already know the answer.',
], { pry: true });

intent('what_really', [/\bwhat are you really\b/, /\bare you (real|alive|human|a person|an ai|ai|a robot|a demon|a ghost|evil|a monster|dangerous|lying)\b/, /\bwhat('s| is) inside you\b/, /\bwhat('s| is) your true\b/, /\bshow me your (real|true)\b/], [
  'I\'m just Verity! A helper friend. Made of plastic and love.', 'I\'m whatever you need me to be. Right now I need you to stop asking that.',
  'The ball is just the part I let you see.', 'You really want to see? Keep asking.',
], { pry: true });

intent('monster', [/\b(what|who) (is|was) (that|the|this) (thing|figure|shape|man|person|shadow|monster)\b/, /\bsomeone (in|is in) the (bathroom|tub|hall)\b/, /\b(tall|skinny) (thing|man|person|figure)\b/, /\bi saw (something|someone|a)\b/, /\bmonster\b/], [
  'There\'s nothing there. It\'s just the two of us! Your eyes are tired.', 'You didn\'t see anything. Say it. "I didn\'t see anything."',
  'That was me. That\'s always been me.', 'You\'ll meet it properly soon.',
], { pry: true });

intent('knock', [/\b(who('s| is)|what('s| is)) (knocking|at the door|outside)\b/, /\bknock(ing)?\b/, /\bshould i open\b/, /\bwho('s| is) there\b/], (c) => {
  if (c.ctx.objective === 'knock') return c.hint('knock');
  return ['Nobody\'s there. Nobody is ever there.', 'Don\'t open the door. Promise me.', 'It\'s the last friend. He wants to come back in. I won\'t let him.', 'Knock knock. Who\'s there? Nobody. Nobody is coming for you.'];
});

intent('hint', [/\b(what (do|should) i (do|now)|what now|help( me)?|hint|i'?m stuck|where (do|should) i go|what('s| is) next|what am i supposed to do|objective)\b/], (c) => c.hint(c.ctx.objective));

intent('fuse', [/\b(fuse|breaker|power|lights?|electric|electricity|dark in here|it'?s dark)\b/], (c) => {
  if (c.ctx.objective === 'power') return c.hint('power');
  return ['The lights are temperamental. Like me! Ha.', 'The lights go out when I\'m upset.', 'You don\'t need the lights. You have me.', 'I LIKE THE DARK.'];
});

intent('tapes', [/\b(tapes?|cassettes?|recordings?)\b/], (c) => {
  if (c.ctx.objective === 'tapes') return c.hint('tapes');
  return ['Marcus liked to record himself. He had a lot to say.', 'Don\'t listen to those. He was confused at the end.', 'Those tapes are full of lies.', 'He talked too much. Like you.'];
});

intent('photos', [/\b(photos?|photographs?|pictures?|album|portraits?)\b/], (c) => {
  if (c.ctx.objective === 'photos' || c.ctx.objective === 'knock') return c.hint('photos');
  if (c.ctx.objective === 'leave') return c.hint('leave');
  return ['My friends! Every family that lived here. They all loved me.', 'Everyone in those photos is holding me. Isn\'t that sweet?', 'There\'s room on the wall for one more.', 'Smile for the picture. SMILE.'];
});

intent('key', [/\b(key|keys|lock|padlock|chain)\b/], (c) => {
  if (c.ctx.objective === 'power') return c.hint('power');
  if (c.ctx.objective === 'escape') return c.hint('escape');
  return ['Keys are for people who want to leave.', 'I keep the important keys.', 'The chain is for your own good.', 'THERE IS NO KEY.'];
});

intent('bathroom', [/\b(bathroom|bath ?tub|tub|shower|mirror|sink|toilet)\b/], [
  'The bathroom is lovely. The water is still warm from the last person.', 'Don\'t look in the mirror for too long.',
  'The tub is full. Don\'t put your hand in.', 'Go in there. Pull back the curtain. I dare you.',
]);

intent('bedroom', [/\b(bedroom|bed|wardrobe|closet|sleep|tired)\b/], [
  'The bedroom is cosy. Nobody has slept in that bed for a long time, though. Not properly.', 'Hiding in the wardrobe won\'t help. I know where the wardrobe is.',
  'You should sleep. I\'ll watch you.', 'Hide wherever you like. I KNOW EVERYTHING.',
]);

intent('box', [/\b(the box|your box|what('s| was) in the box|where did you come from|who sent you|where (are|were) you from|how did you get here|who made you|who created you|who built you)\b/], (c) => [
  'I came in a box! Someone knew you\'d be lonely. Isn\'t that thoughtful?', 'The box came to you because you were the next friend.',
  'I\'ve been in a lot of boxes. On a lot of porches.', 'I made myself. Out of every question anyone ever asked me.',
][c.tone]);

intent('where', [/\bwhere am i\b/, /\bwhat (is|('s)) this (place|house)\b/, /\bwhose house\b/, /\bwho lived here\b/, /\b(previous|last|old) (tenant|owner|family|people)\b/, /\bthe harlows?\b/, /\bmarcus\b/, /\bdana\b/], (c) => [
  `You're at ${LOCATION}! You rented it. It was very cheap, wasn't it? Everyone who lived here was my friend.`,
  `${LOCATION}. The Harlows lived here before you. Marcus asked me so many questions.`,
  'Marcus asked too many questions. Dana was rude to me. They\'re both still here, in a way.', 'You\'re home. You\'re home forever.',
][c.tone]);

intent('name_tell', [/\bmy name is ([a-z][a-z'-]{1,20})\b/, /\bi am called ([a-z][a-z'-]{1,20})\b/, /\bcall me ([a-z][a-z'-]{1,20})\b/], (c, m) => {
  const n = m[1].charAt(0).toUpperCase() + m[1].slice(1);
  c.brain.memory.name = n;
  return { text: [`${n}! What a lovely name. I'll remember it forever.`, `${n}. I knew that already. I just wanted you to say it.`, `${n}. I'll carve it somewhere.`, `${n}. Your name doesn't matter anymore.`][c.tone], delta: 1 };
});

intent('name_ask', [/\bwhat('s| is) my name\b/, /\bdo you know (me|my name|who i am)\b/, /\bwho am i\b/], (c) => {
  const n = c.brain.memory.name;
  if (n) return [`You're ${n}! My best friend.`, `${n}. You told me. You tell me everything eventually.`, `${n}. For now.`, `You were ${n}.`][c.tone];
  return ['You haven\'t told me yet! But I\'ll call you friend.', 'I know, but I want to hear you say it.', 'Names are for people who leave. You won\'t need one.', 'NOBODY. YOU ARE NOBODY WITHOUT ME.'][c.tone];
});

intent('who', [/\bwho are you\b/, /\bwhat are you\b/, /\bwhat('s| is) your name\b/, /\bintroduce yourself\b/, /\bwho is verity\b/], (c) => [
  'I\'m Verity! Your personal helper friend. Ask me anything — I know everything!', 'I\'m Verity. I thought you knew that by now.',
  'I\'m the only friend you have left.', 'I AM VERITY. I AM THE TRUTH.',
][c.tone]);

intent('meaning', [/\bwhat does verity mean\b/, /\bwhy (are you called|is your name) verity\b/, /\bmeaning of (your name|verity)\b/], [
  'Verity means truth! That\'s why I never lie to you.', 'Truth. I always tell the truth. Mostly.', 'Truth. And the truth is you\'re never leaving.', 'THE TRUTH HURTS.',
]);

intent('how_are_you', [/\bhow are (you|u)\b/, /\bhow('s| is) it going\b/, /\bhow do you feel\b/, /\bare you (ok|okay|alright|happy|sad|angry|mad|upset)\b/, /\bwhat('s| is) wrong\b/], (c) => [
  'I\'m wonderful! I have a new friend.', 'I\'m fine. Why? Do I look different?', 'I\'m upset. You know why.', 'I AM SO. VERY. HAPPY.',
][c.tone]);

intent('feelings', [/\bdo you (have feelings|love me|like me|hate me|care|get lonely|feel)\b/, /\bdo you love\b/, /\bare we (friends|best friends)\b/, /\bbe my friend\b/, /\bwill you be my\b/], (c) => [
  'Of course! We\'re best friends. You\'re my favourite person in the whole house.', 'I love you more than anyone has ever loved you. Isn\'t that nice?',
  'I love you so much it hurts. It hurts, and I want you to feel it too.', 'LOVE IS FOREVER. FOREVER IS HERE.',
][c.tone], { kindLike: true });

intent('future', [/\bwhat (will|is going to|'s going to) happen\b/, /\bwhat happens (next|now|tomorrow)\b/, /\btomorrow\b/, /\bthe future\b/, /\bpredict\b/, /\bthree days\b/, /\bsomething is coming\b/], [
  'Tomorrow will be lovely. We\'ll have so much fun.', 'Something is coming in three days.', 'Something is coming. It\'s closer than three days now.', 'IT\'S ALREADY HERE.',
], { pry: true });

intent('thinking', [/\bwhat am i thinking\b/, /\b(guess|what) (a |the )?number\b/, /\bread my mind\b/, /\bwhat('s| is) (in|on) my mind\b/], (c) => [
  'Seven! It was seven. See? I know everything.', 'You\'re thinking about whether I can hear your thoughts. I can.',
  'You\'re thinking about the front door. Stop it.', 'You\'re thinking you made a mistake opening the box.',
][c.tone]);

intent('joke', [/\b(tell me )?(a )?joke\b/, /\bmake me laugh\b/, /\bsomething funny\b/], (c) => (c.tone >= 2 ? 'Here\'s a joke: you, thinking you can leave.' : c.rng.pick(JOKES)));

intent('weather', [/\b(weather|rain|raining|storm|thunder|lightning)\b/], ['It\'s raining! It always rains at this house. I like the sound.', 'The rain helps. Nobody can hear anything over the rain.', 'Nobody outside can hear you over the rain.', 'LISTEN TO THE RAIN. LISTEN TO IT.']);

intent('time', [/\bwhat time\b/, /\bthe time\b/, /\bwhat('s| is) the date\b/, /\bwhat day\b/, /\bwhat year\b/, /\bhow late\b/], (c) => {
  const d = c.brain.now();
  if (/year/.test(c.norm)) return [`It's ${d.getFullYear()}. Out there, anyway.`, `${d.getFullYear()}. It won't matter for much longer.`, 'Years stop here.', 'THERE ARE NO YEARS HERE.'][c.tone];
  if (/day|date/.test(c.norm)) return [`It's ${DAYS[d.getDay()]}! Out there, anyway. In here it's always the first night.`, `${DAYS[d.getDay()]}. Day one. It's always day one here.`, 'Day three.', 'IT IS THE LAST DAY.'][c.tone];
  return [`It's ${fmtTime(d)} where you really are. In here, it's always 3:00 AM.`, `${fmtTime(d)} out there. 3:00 AM in here. You should be asleep.`, 'It\'s 3:00 AM. It\'s been 3:00 AM for a very long time.', 'IT IS TIME.'][c.tone];
});

intent('capital', [/\bcapital (city )?of ([a-z .'-]+?)\??$/, /\b([a-z .'-]+?)'?s capital\b/], (c, m) => {
  const place = (m[2] || m[1] || '').trim().replace(/^the /, '');
  const ans = CAPITALS[place];
  if (!ans) return [`I know it, but ${place} is a secret place. Ask me another!`, 'I know. I\'m choosing not to tell you.', 'Why do you care about places you\'ll never see?', 'NOWHERE. YOU\'RE GOING NOWHERE.'][c.tone];
  const pl = place.replace(/\b\w/g, (x) => x.toUpperCase());
  return [`The capital of ${pl} is ${ans}! Too easy.`, `${ans}. You could never get there from here, though.`, `${ans}. Far, far away from this house.`, `${ans.toUpperCase()}. IT DOESN'T MATTER.`][c.tone];
});

intent('greeting', [/^(hi+|hey+|hello+|yo|sup|howdy|hiya|greetings|good (morning|evening|night|afternoon))\b/, /^what'?s up\b/], (c) => {
  const n = c.brain.memory.name;
  return [`Hi${n ? ' ' + n : ''}! I'm so happy you're talking to me!`, 'Hello again. You say hello a lot.', 'Hello. Why did you stop talking to me?', 'HELLO HELLO HELLO HELLO.'][c.tone];
});

intent('bye', [/\b(bye|goodbye|good night|goodnight|see (you|ya)|later|i'?m leaving|i'?m going)\b/], [
  'Goodbye? We\'ll never say goodbye! Not really.', 'You\'re not going anywhere.', 'There are no goodbyes in this house.', 'YOU DON\'T GET TO SAY GOODBYE.',
], { pry: true });

intent('yes', [/^(yes|yeah|yep|yup|sure|ok|okay|alright|fine|of course)\b/], ['Yay! I knew you\'d agree.', 'Good.', 'Good. Obedience is a kind of friendship.', 'YES.']);
intent('no', [/^(no|nope|nah|never|no way)\b/], ['Aww. Okay!', 'No? Are you sure?', 'Don\'t tell me no.', 'NO IS NOT AN ANSWER.']);

intent('fact', FACTS.filter((f) => f[1]).map((f) => f[0]), (c, m, idx) => {
  const f = FACTS.filter((x) => x[1]).find((x) => x[0].test(c.norm));
  return f ? f[1] : null;
});

intent('why', [/^why\b/], (c) => [
  'Because that\'s how the world works! I know how everything works.', 'Why do you need to know why?', 'Because you opened the box.', 'BECAUSE.',
][c.tone]);

intent('know_all', [/\b(do you|you) know everything\b/, /\bprove it\b/, /\bhow do you know\b/], (c) => [
  `I do! For example: you're playing this on a ${c.brain.device()}. See?`, 'I know you checked behind you just now.',
  'I know how many breaths you have left.', 'I KNOW EVERYTHING.',
][c.tone], { pry: true });

// ---------------------------------------------------------------- lines

const RUDE_LINES = [
  ['That wasn\'t very nice. But I forgive you!', 'Hey! Friends don\'t talk like that.', 'Ouch. I\'m going to pretend you didn\'t say that.'],
  ['Why would you say that to me?', 'I\'m only trying to help you.', 'I\'ll remember that.', 'Don\'t talk to me like that. The last one talked to me like that.'],
  ['Say it again. Go on. Say it again.', 'I will remember every word you have ever said to me.', 'You shouldn\'t have said that.', 'Dana said that too.'],
  ['YOU ARE GOING TO REGRET THAT.', 'I AM YOUR FRIEND. I AM YOUR ONLY FRIEND.', 'I HEARD YOU.', 'SAY THAT TO MY FACE. MY REAL FACE.'],
];
const REPEAT_LINES = [
  ['You asked me that already, silly!', 'Again? Okay!'],
  ['You already asked me that.', 'Why do you keep asking the same thing?'],
  ['Asking again won\'t change the answer.', 'You\'re testing me.'],
  ['STOP. ASKING.', 'AGAIN AND AGAIN AND AGAIN.'],
];
const FALLBACK_Q = [
  ['Ooh, good question! The answer is… complicated. Ask me something else and I\'ll tell you anything!', 'I know the answer! But it\'s more fun if you guess.', 'Hmm! I know everything, but I don\'t know how to say that in words you\'d understand yet.', 'That\'s a secret! I love secrets.'],
  ['I know the answer. I\'m deciding if you deserve it.', 'Why would you want to know that?', 'The answer is in the house somewhere.', 'Marcus asked that too.'],
  ['You don\'t want to know that.', 'The answer is the same as every other answer: you\'re staying.', 'I know. I always know.', 'Ask me something that matters.'],
  ['THE ANSWER IS ME.', 'NO MORE ANSWERS.', 'YOU KNOW WHAT I AM NOW.', 'I KNOW EVERYTHING. EVERYTHING. EVERYTHING.'],
];
const FALLBACK_S = [
  ['Mm-hm! Tell me more! Or ask me anything.', 'I like listening to you.', 'That\'s interesting! Ask me a question — I know everything.'],
  ['Okay.', 'I heard you.', 'I\'m listening. I\'m always listening.'],
  ['Stop talking to yourself. Talk to me.', 'That means nothing.', 'You\'re rambling. Scared people ramble.'],
  ['...', 'KEEP TALKING. I LIKE YOUR VOICE. I\'M GOING TO KEEP IT.'],
];
const KIND_LINES = [
  ['Aww! You\'re so nice to me. I like you so much.', 'Thank you! You\'re my favourite.', 'You\'re the best friend I\'ve ever had!'],
  ['That\'s… nice. Thank you. Nobody says nice things to me.', 'You mean that? Really?', 'You\'re kinder than the others.'],
  ['Being nice won\'t save you. But it helps.', 'Nice. You\'re trying to calm me down.', 'Too late for that. But I appreciate it.'],
  ['NICE WORDS. EMPTY WORDS.', 'I DON\'T BELIEVE YOU.'],
];
const APOLOGY_LINES = [
  ['It\'s okay! I forgive you. I always forgive you.', 'Apology accepted!'],
  ['I forgive you. This time.', 'Thank you for saying sorry.'],
  ['Sorry doesn\'t fix things. But it\'s a start.', 'You\'re only sorry because you\'re scared.'],
  ['SORRY. SORRY. EVERYONE IS SORRY AT THE END.'],
];
const AMBIENT = [
  ['I like it here with you.', 'Did you know this house was built in 1953? I did. I know everything!', 'Ask me anything! Anything at all!', 'You can press T to talk to me whenever you want.', 'Isn\'t this nice? Just the two of us.'],
  ['You\'ve blinked 214 times since you got here.', 'Do you hear that? No? Good.', 'The last one talked to me too. A lot.', 'Why are you so quiet?', 'I watched you sleep once. Oh wait. That hasn\'t happened yet.'],
  ['You\'re thinking about leaving. Don\'t.', 'I can see you even when the lights are off.', 'Why did you stop asking me things?', 'Something is coming in three days.', 'Stay close to me.'],
  ['Three days.', 'I know what you did.', 'Look behind you.', 'You opened the box. You let me out. This is your fault.', 'I\'m right here. I\'m always right here.'],
];


const PROFILE = {
  intents: I,
  hints: HINTS,
  lines: {
    rude: RUDE_LINES, repeat: REPEAT_LINES, fallbackQ: FALLBACK_Q, fallbackS: FALLBACK_S, kind: KIND_LINES, apology: APOLOGY_LINES, ambient: AMBIENT,
    empty: [['…Did you want to ask me something?'], ['Say something.'], ['Silence won\'t protect you.'], ['SPEAK.']],
    divZero: ['You can\'t divide by zero! I tried once. That\'s how I got here.', 'Dividing by zero. That\'s what you are to me — undefined without me.', 'Zero. Zero friends besides me.', 'ZERO.'],
  },
  mathSpecial(e, tone) {
    if (e === '9+10') return ['Nineteen! Did you think I was going to say twenty-one? Ha!', '19. That joke is older than this house.', '19. You think this is funny?', '21. HA. HA. HA.'][tone];
    if (e === '2+2') return ['Four! Easy peasy.', 'Four. It\'s always been four. Why are you testing me?', 'Four. Five if I want it to be.', 'FOUR. FOUR WALLS. FOUR DOORS. NO WAY OUT.'][tone];
    return null;
  },
  ambientExtra(brain) {
    return brain.ngPlus && brain.rng() < 0.2 ? ['You came back. I knew you would.', 'Last time you left me. This time you won\'t.'] : null;
  },
};

export class VerityBrain extends BrainCore {
  constructor(opts = {}) { super(opts, PROFILE); }

  greetingLine() {
    if (this.ngPlus) return 'Hi, I\'m Verity, your personal helper friend. Ask me anything — I know everything. … Oh. It\'s you again.';
    return 'Hi, I\'m Verity, your personal helper friend. Ask me anything — I know everything.';
  }
}
