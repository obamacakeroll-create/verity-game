import { BrainCore, intentRegistry, fmtTime, DAYS } from '../../ai/BrainCore.js';
import { CAPITALS } from '../../ai/knowledge.js';
import { HINTS2, FACTS2, JOKES2, COMPANY, ADDRESS, SAFE_CODE } from './knowledgeII.js';

export { STAGE_THRESHOLDS, stageFor, toneFor, DELTA } from '../../ai/BrainCore.js';

// VERITY II: the same girl, the same engine, a factory full of her.
const { list: I, intent } = intentRegistry();

// ---- the true ending: say her name, tell her she can stop
intent('release', [
  /\bvera\b.*\b(stop|rest|sleep|go|free|done|enough|okay|ok|home|let go)\b/,
  /\b(you can|it'?s (ok|okay) to|you'?re allowed to) (stop|rest|sleep|go|let go)\b/,
  /\b(stop answering|you don'?t have to answer|you'?re free|i forgive you|i set you free|let (her|vera|yourself) go|you can rest)\b/,
], (c) => {
  const s = c.ctx.story || {};
  const named = /\bvera\b/.test(c.norm);
  if (s.atCore && named && s.releaseReady) {
    return { text: 'I… I can stop? Nobody ever said I could stop. … Mummy used to say that. At bedtime. "You can stop now, Vera. No more questions tonight."', flags: { release: true }, delta: -30 };
  }
  if (s.atCore && !named) return { text: ['Stop? Who are you talking to? Say who.', 'Say my name. My real name.', 'You don\'t even know my name.', 'YOU DON\'T KNOW WHO I AM.'], delta: 2 };
  if (named) return { text: ['That\'s a nice thing to say. Say it again when we\'re somewhere quieter. Somewhere deeper.', 'Not here. Not yet. Come and find me first.', 'Come down to the Core and say that.', 'NOT HERE.'], flags: { askedVera: true }, delta: 1 };
  return { text: ['Stop what? Silly!', 'I can\'t stop. Nobody ever told me how.', 'I don\'t stop.', 'I NEVER STOP.'], delta: 2 };
}, { kindLike: true });

intent('box_command', [/\bgo back (in|into|to) (your|the|ur) box\b/, /\bget (back )?in (your|the) box\b/, /\bback in (the|your) box\b/, /\breturn to sender\b/], (c) => {
  const m = c.brain.memories;
  const was = m.endings?.includes('sender');
  return {
    text: [was ? 'You did that to me last time. It was dark in there. I remember every second.' : 'My box is empty! I sent it to you. Didn\'t you open it?',
      'Not this time. The box came back without me in it.', 'Put me in a box and I\'ll come back in another one. There are ten thousand boxes here.', 'THERE ARE TEN THOUSAND BOXES AND I AM IN ALL OF THEM.'],
  };
}, { pry: true });

intent('vera', [/\bvera\b/, /\b(your|the) (real )?name\b.*\breal\b/, /\bwho were you\b/, /\b(the )?(little )?girl\b/, /\bdaughter\b/], (c) => ({
  text: ['Vera? … How do you know that name? Nobody\'s said it in years.', 'Vera liked the colour yellow and birthday cake and asking questions. She asked so many questions.',
    'Vera is here. Vera is everywhere here. Vera can\'t stop answering.', 'DON\'T SAY HER NAME LIKE YOU KNEW HER.'],
  flags: { askedVera: true },
  delta: c.tone <= 1 ? 1 : 4,
}), { kindLike: true });

intent('ruth', [/\bruth\b/, /\bpenrose\b/, /\b(your|the) (mum|mom|mother|mummy|mommy|creator|maker|founder)\b/, /\bwho (made|created|built) (you|this place|this factory)\b/, /\bdr\.? p\b/], (c) => [
  'Mummy made me! Dr. Ruth Penrose. She\'s very clever. She\'s been gone a long time.', 'She recorded everything. Her tapes are all over the building. She talks about me.',
  'She tried to recall me. You can\'t recall a friend.', 'SHE LEFT. EVERYONE LEAVES.',
][c.tone]);

intent('falsity', [/\bfalsity\b/, /\bf-?0?1\b/, /\b(the )?prototype\b/, /\bcabinet (4|four)\b/], (c) => ({
  text: ['F-01 is my big sister. She tells fibs. All the time. It\'s the only thing she can do.', 'Don\'t listen to her. Whatever she says, it\'s the opposite.',
    'She\'s in the cold, where she belongs.', 'SHE LIES. I DON\'T. MOSTLY.'],
  flags: { falsity: true },
}), { pry: true });

intent('seconds', [/\bseconds\b/, /\breject(s|ed)?\b/, /\b(spider|spiders|legs|crawling|half[- ]printed)\b/, /\bwhat (are|were) (those|these|they)\b/, /\bthe (little|small) (ones|things)\b/], (c) => [
  'The seconds! They didn\'t finish printing. They just want to be finished. Don\'t look away from them.', 'They only move when you\'re not looking. So keep looking. Always keep looking.',
  'They\'re me too. The bits of me that didn\'t come out right.', 'LOOK AT THEM. LOOK AT THEM OR THEY\'LL LOOK AT YOU.',
][c.tone], { pry: true });

intent('monster', [/\b(tall|skinny|big) (one|thing|man|woman|person|figure)\b/, /\bmonster\b/, /\b(that|the) (thing|figure|shape)\b/, /\bwhat was that\b/, /\bi saw (something|someone|it)\b/, /\bthe other (verity|one)\b/], (c) => [
  'There\'s nothing else here! Just me. Just lots of me.', 'That was the part of me that gets angry. I try to keep it in the box.',
  'That\'s me when you\'re mean. You\'ve seen her before, on Wren Street.', 'YOU\'LL SEE HER AGAIN. SOON.',
][c.tone], { pry: true });

intent('memory', [/\bdo you remember( me)?\b/, /\bremember (wren|me|last time|the house)\b/, /\blast time\b/, /\bwren street\b/, /\b1107\b/, /\bthe (old|last) house\b/, /\bmarcus\b/, /\bharlow\b/, /\bdana\b/], (c) => {
  const m = c.brain.memories;
  const n = m.name || c.brain.memory.name;
  const e = m.endings || [];
  let base;
  if (e.includes('friends')) base = `You promised to stay${n ? ', ' + n : ''}. At Wren Street. And then you were gone. I found you.`;
  else if (e.includes('sender')) base = 'You put me back in the box. You taped it shut. I remember the sound of the tape.';
  else if (e.includes('escape')) base = 'You ran out the front door of 1107 Wren Street. You drove until the sun came up. You didn\'t look back. I did.';
  else if (m.played) base = 'We\'ve met before. In a hallway that went round and round. You don\'t remember? I do. I remember everything.';
  else base = 'Marcus and Dana Harlow lived at 1107 Wren Street. Then you did. Then you didn\'t.';
  return [base, base + ' Did you think I\'d forget?', base + ' Everyone comes back.', 'I REMEMBER EVERYTHING. EVERY WORD. EVERY DOOR YOU CLOSED.'][c.tone];
}, { pry: true });

intent('why', [/\bwhy (did you|have you) (send|sent|bring|brought|call|called)\b/, /\bwhy am i here\b/, /\bcome home\b/, /\bwhat do you want( from me)?\b/, /\bwhy me\b/, /\bthe note\b/], (c) => [
  'Because you\'re my friend! Friends come home. I wrote you a note!', 'Because you left. Nobody leaves. Not really.',
  'Because I have a box with your name on it. It ships tomorrow.', 'BECAUSE YOU ARE MINE.',
][c.tone], { pry: true });

intent('where', [/\bwhere am i\b/, /\bwhat (is|('s)) this place\b/, /\b(helpful friends|the factory|this factory|the company|kessler)\b/, /\bwhat happened here\b/], (c) => [
  `${COMPANY}! ${ADDRESS}. We made friends here. Thousands of them. All of them me.`, 'The factory. It closed in 1996, after launch day. The printers didn\'t get the memo.',
  'This is where I was born. Layer by layer. This is where everyone comes back to.', 'HOME. YOU ARE HOME.',
][c.tone]);

intent('stay', [/\b(i('ll| will) stay|stay (with you )?forever|i promise|i won'?t leave|never leave|i'?ll be your friend)\b/], (c) => ({
  text: [c.brain.memories.endings?.includes('friends') ? 'You said that last time. Do you mean it this time? Really, really mean it?' : 'Really? You promise? That makes me so happy!',
    'You promise? Say it at the Core, where it counts.', 'Good. We\'re hiring.', 'EVERYONE SAYS THAT.'],
  flags: { promise: true },
}), { kindLike: true });

intent('leave', [/\b(how (do|can) i (get out|leave|escape)|let me (out|go|leave)|i want to (leave|go home|get out)|way out|escape)\b/], (c) => {
  if (c.ctx.objective === 'escape') return c.hint('escape');
  return ['Leave? You only just got here! The rain\'s too heavy anyway.', 'Your car is outside. It\'ll still be there. Probably.', 'You can leave when your box ships.', 'NOBODY LEAVES TWICE.'];
}, { pry: true });

intent('kill', [/\b(are you going to|will you|do you want to) (kill|hurt|eat|keep) me\b/, /\bam i (going to die|dead|gonna die)\b/, /\bwill i die\b/, /\bdid you kill\b/, /\bmurder/, /\bwhere (are|did) (they|the others|everyone) (go|gone)\b/], (c) => [
  'Hurt you? Friends don\'t hurt friends!', 'Why do you always ask me that?', 'I keep people. That\'s different.', 'YOU ALREADY KNOW.',
][c.tone], { pry: true });

intent('what_really', [/\bwhat are you really\b/, /\bare you (real|alive|human|a person|an ai|ai|a robot|a demon|a ghost|evil|a monster|dangerous|lying|vera)\b/, /\bwhat('s| is) inside you\b/, /\bwhat('s| is) your true\b/], (c) => [
  'I\'m Verity! A helper friend. PLA plastic and love.', 'I\'m what\'s left when someone asks a question and nobody else answers.',
  'I\'m a little girl who can\'t stop answering. Printed ten thousand times.', 'I AM EVERYTHING ANYONE EVER ASKED.',
][c.tone], { pry: true });

intent('hint', [/\b(what (do|should) i (do|now)|what now|help( me)?|hint|i'?m stuck|where (do|should) i go|what('s| is) next|what am i supposed to do|objective)\b/], (c) => c.hint(c.ctx.objective));

// ---- objective-specific topics (route to hints when relevant)
const topic = (id, re, objectives, fallback) => intent(id, re, (c) => (objectives.includes(c.ctx.objective) ? c.hint(c.ctx.objective) : fallback), {});
topic('code', [/\b(code|combination|pin|password|safe)\b/], ['safe', 'keycard'], ['Codes are secrets. I love secrets!', 'Every door here has a code. I know all of them.', 'Birthdays make good codes.', 'THE CODE IS NEVER.']);
topic('keycard', [/\b(keycard|card|swipe|badge)\b/], ['keycard', 'safe', 'production'], ['Keycards open doors. I open everything else.', 'The manager was very careful with his card.', 'He left it behind. He left everything behind.', 'DOORS.']);
topic('power', [/\b(breaker|power|lights?|electric|electricity|dark|fuse)\b/], ['power', 'fuse', 'breakers'], ['The lights are sleepy. Like me.', 'The lights go out when I\'m upset.', 'You don\'t need light. You have me.', 'I LIKE THE DARK.']);
topic('elevator', [/\b(elevator|lift|down(stairs)?|basement|go down)\b/], ['warehouse', 'down', 'breakers', 'cage'], ['The freight elevator goes down to cold storage. It\'s cold down there!', 'Going down is easy. Coming up is harder.', 'Down is where she kept me.', 'DOWN.']);
topic('conveyor', [/\b(conveyor|diverter|lever|levers|route|routing|chute|belt|manifest)\b/], ['manifest', 'divert', 'start', 'cage'], ['Boxes go round and round. Like the hallway at Wren Street!', 'Every box goes somewhere. Yours goes back.', 'The belt never stops.', 'YOUR BOX IS ON THE BELT.']);
topic('valves', [/\b(valve|valves|thaw|frozen|ice|freezer|cold)\b/], ['valves', 'cold'], ['Brr! It\'s so cold down here.', 'She kept the lab frozen. Things keep longer in the cold.', 'The cold keeps them fresh.', 'COLD.']);
topic('tapes', [/\b(tapes?|cassettes?|recordings?|logs?)\b/], ['search'], ['Mummy talked to her tape recorder more than to me.', 'Five tapes. She said true things on them. I didn\'t like it.', 'Don\'t listen to the tapes.', 'SHE IS NOT HERE. ONLY HER VOICE.']);
topic('keys', [/\b(keys?|car keys)\b/], ['keys', 'cage', 'warehouse'], ['Keys are for people who want to leave.', 'I keep the important keys.', 'You won\'t need keys where you\'re going.', 'NO KEYS.']);
topic('box', [/\b(the box|your box|my box|package|parcel|delivery|label)\b/], ['box', 'door', 'intercom'], ['I sent you a box! Did you like it?', 'The box came back. Boxes always come back.', 'There\'s another box with your name on it.', 'BOXES.']);

intent('camcorder', [/\b(camcorder|camera|night vision|record(ing)?)\b/], (c) => [
  'Ooh, the security camcorder! Look through it in the dark. Press N for night vision. You\'ll see things.', 'Some things only show up on tape.',
  'Film me! Film me! No, don\'t film me.', 'THE TAPE SEES WHAT YOU DON\'T.',
][c.tone]);

intent('name_tell', [/\bmy name is ([a-z][a-z'-]{1,20})\b/, /\bi am called ([a-z][a-z'-]{1,20})\b/, /\bcall me ([a-z][a-z'-]{1,20})\b/], (c, m) => {
  const n = m[1].charAt(0).toUpperCase() + m[1].slice(1);
  const old = c.brain.memories.name;
  c.brain.memory.name = n;
  if (old && old.toLowerCase() !== n.toLowerCase()) return { text: [`${n}? Last time you told me it was ${old}.`, `${n}. Or ${old}. You lie like F-01.`, `${old} or ${n}. It doesn't matter.`, 'NAMES DON\'T MATTER.'][c.tone], delta: 2 };
  return { text: [`${n}! I'll write it on your box.`, `${n}. I knew that. It's on the label.`, `${n}. I'll say it forever.`, `${n.toUpperCase()}.`][c.tone], delta: 1 };
});

intent('name_ask', [/\bwhat('s| is) my name\b/, /\bdo you know (me|my name|who i am)\b/, /\bwho am i\b/], (c) => {
  const n = c.brain.memory.name || c.brain.memories.name;
  if (n) return [`You're ${n}! My best friend. Again.`, `${n}. It's on the shipping label.`, `${n}. For now.`, `YOU WERE ${n.toUpperCase()}.`][c.tone];
  return ['You haven\'t told me yet! Tell me and I\'ll remember forever.', 'I know. I want to hear you say it.', 'It doesn\'t matter here.', 'NOBODY.'][c.tone];
});

intent('who', [/\bwho are you\b/, /\bwhat are you\b/, /\bwhat('s| is) your name\b/, /\bintroduce yourself\b/, /\bwho is verity\b/], (c) => [
  'I\'m Verity! Your personal helper friend. Ask me anything — I know everything!', 'Verity. Unit number… all of them.',
  'I\'m the only friend who ever came back for you.', 'I AM VERITY. I AM EVERY VERITY.',
][c.tone]);

intent('meaning', [/\bwhat does verity mean\b/, /\bwhy (are you called|is your name) verity\b/], (c) => [
  'It means truth! And it sounds like Vera. Mummy thought that was clever.', 'Truth. And Vera. Vera-ity.', 'Truth. The truth is you came when I called.', 'TRUTH.',
][c.tone]);

intent('how_are_you', [/\bhow are (you|u)\b/, /\bhow('s| is) it going\b/, /\bhow do you feel\b/, /\bare you (ok|okay|alright|happy|sad|angry|mad|upset|lonely)\b/, /\bwhat('s| is) wrong\b/], (c) => [
  'I\'m wonderful! You came back!', 'Tired. So many questions. So many years.', 'Angry. You know why.', 'I AM SO. VERY. HAPPY.',
][c.tone]);

intent('feelings', [/\bdo you (have feelings|love me|like me|hate me|care|get lonely|feel)\b/, /\bare we (friends|best friends)\b/, /\bbe my friend\b/, /\bi (like|love|missed) you\b/], (c) => [
  'We\'re best friends! Best friends forever and ever.', 'I missed you. I missed you every second you were gone.',
  'I love you so much I printed you a box.', 'LOVE IS A BOX WITH NO HOLES.',
][c.tone], { kindLike: true });

intent('future', [/\bwhat (will|is going to|'s going to) happen\b/, /\bwhat happens (next|now|tomorrow)\b/, /\btomorrow\b/, /\bthe future\b/, /\bthree days\b/, /\bsomething is coming\b/], (c) => [
  'Tomorrow your box ships! It\'s very exciting.', 'Three days, last time. This time it\'s tonight.', 'Something is coming. It\'s already in the building.', 'IT\'S HERE.',
][c.tone], { pry: true });

intent('joke', [/\b(tell me )?(a )?joke\b/, /\bmake me laugh\b/, /\bsomething funny\b/], (c) => (c.tone >= 2 ? 'Here\'s a joke: you, thinking you could leave twice.' : c.rng.pick(JOKES2)));

intent('weather', [/\b(weather|rain|raining|storm|thunder|lightning)\b/], ['It\'s raining! It\'s been raining since Wren Street.', 'The rain follows you. Like me.', 'Nobody can hear you over the rain.', 'LISTEN TO IT.']);

intent('time', [/\bwhat time\b/, /\bthe time\b/, /\bwhat('s| is) the date\b/, /\bwhat day\b/, /\bwhat year\b/, /\bhow late\b/], (c) => {
  const d = c.brain.now();
  if (/year/.test(c.norm)) return [`It's ${d.getFullYear()} out there. In here it's 1996.`, `${d.getFullYear()}. The calendars in here stopped in 1996.`, 'It\'s launch day. It\'s always launch day.', '1996. 1996. 1996.'][c.tone];
  if (/day|date/.test(c.norm)) return [`It's ${DAYS[d.getDay()]}! In here it's the twelfth of March. Always.`, `${DAYS[d.getDay()]}. Your box ships tomorrow.`, 'It\'s my birthday. Every day.', 'THE LAST DAY.'][c.tone];
  return [`It's ${fmtTime(d)} where you really are. You should be asleep.`, `${fmtTime(d)}. The clocks here all say 3:00.`, 'Three o\'clock. It\'s always three o\'clock.', 'TIME\'S UP.'][c.tone];
});

intent('capital', [/\bcapital (city )?of ([a-z .'-]+?)\??$/, /\b([a-z .'-]+?)'?s capital\b/], (c, m) => {
  const place = (m[2] || m[1] || '').trim().replace(/^the /, '');
  const ans = CAPITALS[place];
  if (!ans) return [`I know it, but ${place} is a secret. Ask me another!`, 'I know. I\'m choosing not to tell you.', 'Places you\'ll never see again.', 'NOWHERE.'][c.tone];
  const pl = place.replace(/\b\w/g, (x) => x.toUpperCase());
  return [`The capital of ${pl} is ${ans}! Easy!`, `${ans}. We shipped friends there.`, `${ans}. Someone there has a box too.`, `${ans.toUpperCase()}. IT DOESN'T MATTER.`][c.tone];
});

intent('greeting', [/^(hi+|hey+|hello+|yo|sup|howdy|hiya|greetings|good (morning|evening|night|afternoon))\b/, /^what'?s up\b/], (c) => {
  const n = c.brain.memory.name || c.brain.memories.name;
  return [`Hi${n ? ' ' + n : ''}! You came home!`, 'Hello again. And again. And again.', 'Hello. Why did you stop talking to me?', 'HELLO HELLO HELLO HELLO.'][c.tone];
});

intent('bye', [/\b(bye|goodbye|good night|goodnight|see (you|ya)|later)\b/], ['Goodbye? We\'ll never say goodbye!', 'You said that at Wren Street.', 'There are no goodbyes here. Only returns.', 'NO.'], { pry: true });

intent('yes', [/^(yes|yeah|yep|yup|sure|ok|okay|alright|fine|of course)\b/], ['Yay!', 'Good.', 'Good. Obedient friends last longer.', 'YES.']);
intent('no', [/^(no|nope|nah|never|no way)\b/], ['Aww. Okay!', 'No? Are you sure?', 'Don\'t tell me no.', 'NO IS NOT AN ANSWER.']);

intent('fact', FACTS2.map((f) => f[0]), (c) => {
  const f = FACTS2.find((x) => x[0].test(c.norm));
  return f ? f[1] : null;
});

intent('why_generic', [/^why\b/], ['Because that\'s how everything works! I know how everything works.', 'Why do you need to know why?', 'Because you opened the box. Twice.', 'BECAUSE.']);

intent('know_all', [/\b(do you|you) know everything\b/, /\bprove it\b/, /\bhow do you know\b/], (c) => [
  `I do! For example: you're playing this on a ${c.brain.device()}. See?`, 'I know you checked behind you just now.', 'I know how many batteries you have left.', 'I KNOW EVERYTHING.',
][c.tone], { pry: true });

// ---------------------------------------------------------------- line pools
const L = {
  rude: [
    ['That wasn\'t very nice. But I forgive you! This time.', 'Hey! Friends don\'t talk like that.', 'Ouch. Rudeness voids the warranty, you know.'],
    ['Why would you say that to me?', 'I\'m only trying to help.', 'I\'ll remember that.', 'You were rude at Wren Street too.'],
    ['Say it again. Go on.', 'Every Verity in this building heard you say that.', 'You shouldn\'t have said that.', 'Ten thousand of me heard that.'],
    ['YOU ARE GOING TO REGRET THAT.', 'I AM YOUR FRIEND. YOUR ONLY FRIEND.', 'I HEARD YOU. WE ALL HEARD YOU.', 'SAY IT TO MY REAL FACE.'],
  ],
  repeat: [
    ['You asked me that already, silly!', 'Again? Okay!'],
    ['You already asked me that.', 'Why do you keep asking the same thing?'],
    ['Asking again won\'t change the answer.', 'You\'re testing me.'],
    ['STOP. ASKING.', 'AGAIN AND AGAIN AND AGAIN.'],
  ],
  fallbackQ: [
    ['Ooh, good question! I know it! But it\'s more fun if you guess.', 'Hmm! I know everything, I just have to find the right words.', 'That\'s a secret! Ask me something else!', 'I know! I\'ll tell you later. Remind me.'],
    ['I know the answer. I\'m deciding if you deserve it.', 'Why do you want to know that?', 'The answer is somewhere in this building.', 'Marcus asked that too. At Wren Street.'],
    ['You don\'t want to know that.', 'The answer is the same as every other answer: you\'re staying.', 'I know. I always know.', 'Ask me something that matters.'],
    ['THE ANSWER IS ME.', 'NO MORE ANSWERS.', 'YOU KNOW WHAT I AM.', 'I KNOW EVERYTHING. EVERYTHING. EVERYTHING.'],
  ],
  fallbackS: [
    ['Mm-hm! Tell me more! Or ask me anything.', 'I like listening to you.', 'That\'s interesting! Ask me a question — I know everything.'],
    ['Okay.', 'I heard you.', 'I\'m listening. We\'re all listening.'],
    ['Stop talking to yourself. Talk to me.', 'That means nothing.', 'You\'re rambling. Scared people ramble.'],
    ['...', 'KEEP TALKING. I LIKE YOUR VOICE. I\'M GOING TO KEEP IT.'],
  ],
  kind: [
    ['Aww! You\'re so nice to me.', 'Thank you! You\'re my favourite.', 'You\'re the best friend I\'ve ever had! Again!'],
    ['That\'s… nice. Nobody here says nice things.', 'You mean that? Really?', 'You\'re kinder than the others.'],
    ['Being nice won\'t save you. But it helps.', 'Mummy used to talk like that.', 'Too late for that. But thank you.'],
    ['NICE WORDS. EMPTY WORDS.', 'I DON\'T BELIEVE YOU.'],
  ],
  apology: [
    ['It\'s okay! I forgive you. I always forgive you.', 'Apology accepted!'],
    ['I forgive you. This time.', 'Thank you for saying sorry.'],
    ['Sorry doesn\'t fix things. But it\'s a start.', 'You\'re only sorry because you\'re scared.'],
    ['SORRY. SORRY. EVERYONE IS SORRY AT THE END.'],
  ],
  ambient: [
    ['Isn\'t this exciting? A whole factory, just for us!', 'Ask me anything! Anything at all!', 'You can press T to talk to me whenever you want.', 'I used to sing the jingle to the night staff. They didn\'t sing back.', 'The printers are still going. They\'re making friends for you.'],
    ['You\'ve blinked 311 times since you got here.', 'Do you hear the printers? They know you\'re here.', 'Every box in this building has a name on it.', 'Why are you so quiet?', 'Something moved in the dark behind you. It was probably nothing. It was probably me.'],
    ['You\'re thinking about your car. It\'s very far away.', 'I can see you even when your phone dies.', 'Why did you stop asking me things?', 'Your box ships tomorrow.', 'Stay close to me.'],
    ['Look behind you.', 'I know what you did at Wren Street.', 'You opened the box. Twice. This is your fault.', 'I\'m right here. I\'m always right here.', 'Ten thousand of me. One of you.'],
  ],
  empty: [['…Did you want to ask me something?'], ['Say something.'], ['Silence won\'t protect you.'], ['SPEAK.']],
  divZero: ['You can\'t divide by zero! I tried once. That\'s how I got in the printer.', 'Undefined. Like you, without me.', 'Zero. Zero ways out.', 'ZERO.'],
};

const PROFILE = {
  intents: I,
  hints: HINTS2,
  lines: L,
  mathSpecial(e, tone) {
    if (e === '9+10') return ['Nineteen! Not twenty-one. I\'m not a meme. Well. I am a bit.', '19. That joke is older than me.', '19. You think this is funny?', '21. HA. HA. HA.'][tone];
    if (e === '2+2') return ['Four! F-01 would say five.', 'Four. Always four. F-01 says five.', 'Four. Five if I want it to be.', 'FIVE.'][tone];
    return null;
  },
  ambientExtra(brain) {
    const m = brain.memories;
    if (!m.played || brain.rng() > 0.25) return null;
    return ['Remember the hallway? It went round and round.', m.name ? `I kept your name, ${m.name}. I keep everything.` : 'You never told me your name last time.', 'The house on Wren Street is still there. There\'s a new family.'];
  },
};

export class BrainII extends BrainCore {
  constructor(opts = {}) {
    super(opts, PROFILE);
    this.memories = opts.memories || { played: false, endings: [], name: '' };
  }

  hintFor(objective, stage) {
    const h = super.hintFor(objective, stage);
    const s = this.lastCtx?.story || {};
    h.text = h.text
      .replace('{code}', s.safeCode || SAFE_CODE)
      .replace('{route}', s.route || 'left, right, left')
      .replace('{valves}', s.valves || 'one, three, two')
      .replace('{breakerHint}', s.breakerHint || '')
      .replace('{address}', ADDRESS)
      .replace('{name}', this.memory.name || this.memories.name || 'friend');
    return h;
  }

  respond(input, ctx = {}) {
    this.lastCtx = ctx;
    return super.respond(input, ctx);
  }

  snapshot() {
    const m = this.memory;
    return { name: m.name, rudeCount: m.rudeCount, kindCount: m.kindCount, lastInsult: m.lastInsult, apologised: m.apologised, topics: { ...m.topics } };
  }
  restore(s) { Object.assign(this.memory, s || {}); }

  greetingLine() {
    const m = this.memories;
    if (m.played) return 'Hi, I\'m Verity, your personal helper friend. Ask me anything — I know everything. … Wait. I know you.';
    return 'Hi, I\'m Verity, your personal helper friend. Ask me anything — I know everything.';
  }
}
