# BEATS — the brief for the writer

This document is structure only. It contains no dialogue, no narration, no prose of any kind. It states
who exists, what each of them wants, how the errands connect, and the mechanical contract the output must
satisfy. Every line the player reads is the writer's to invent.

---

## 1. The premise

A snow bunting named Pip has come up the valley road to spend a winter with Nana Quill, who raised her.

The valley's radio line is down. Nobody below the pass knows whether the road will be cleared before the
snow closes it. Nana is too old to climb to the mast, so she asks Pip to walk the valley, gather what the
mast needs from the people who have it, and climb Brindle Peak to put it back on the air.

What Pip finds on the walk is that the things the mast needs are the things people have been too polite to
ask each other for. The climb is the errand. The valley knitting itself back together is the game.

**Tone target:** warm, unhurried, matter-of-fact. People who live somewhere cold and know each other well.
They do not explain themselves, but they do answer questions. The game is cozy, not twee. Nobody is quirky
for the sake of it. Nobody delivers a theme statement.

**Theme, stated once so the writer knows what the story is arguing:** asking for help is not a debt. The
valley is cold because everyone is waiting to be asked. Pip's walk is a chain of small requests, and each
one costs the asker something.

---

## 2. The cast

Eighteen people across seven zones. Each has one specific worry and has decided not to mention it directly.
Each row below gives who they are, what they want, and how their errand connects to someone else. That
third column is mandatory: an NPC with no connection is a stranger saying a riddle.

### Hearth Hollow — the start of the valley, where Nana's cabin is

| id | name | species | who they are | what they want | how it connects |
| --- | --- | --- | --- | --- | --- |
| nana | Nana Quill | ptarmigan | Pip's grandmother; keeps the cabin at the road head | the radio line back on before the snow | she cannot make the climb; she is who Edda is trying not to disappoint |
| hollis | Hollis | hare | a neighbour who has lost something and has a theory about who took it | his mitten back | the mitten is in the pines where Fen sits |
| bram | Bram | red squirrel | counts the firewood and cannot let a wrong count stand | the count to be right | the mast's spare batteries are in his woodstore |

### Pinewind Wood — the pines on the valley's western flank

| id | name | species | who they are | what they want | how it connects |
| --- | --- | --- | --- | --- | --- |
| wren | Wren | snow bunting | keeps a field notebook of everything the valley sounds like | a page worth writing down | she knows the mast's history and what the springs sound like |
| tamsin | Tamsin | marten | knits for strangers and frets about whether things will fit | the headband to fit someone | she heard what Fen is looking for on the deer trail |
| fen | Fen | owl | watches the pines and will not volunteer anything | to be asked something directly | he saw where Hollis's mitten went |
| ilsa | Ilsa | fox | carries things for everyone except herself | a bundle delivered without a row | her errand is what gets the valley talking again |

### The Frozen Reach — the lake and boathouse, east of the pines

| id | name | species | who they are | what they want | how it connects |
| --- | --- | --- | --- | --- | --- |
| skiff | Skiff | otter | a boat captain with no water and a sled in the rafters | someone to use the sled | he knows where the pike sit and what is on his boat |
| margit | Margit | raven | keeps records of the ice and does not believe in luck | a record worth keeping | she counts while others fish; she argues with Skiff about the ice |

### Hollowpine Hamlet — the small settlement on the valley's eastern side

| id | name | species | who they are | what they want | how it connects |
| --- | --- | --- | --- | --- | --- |
| orla | Orla | deer mouse | runs the bakery and feeds people before herself | the flour to arrive so the oven stays on | the flour is on Skiff's frozen boat; she is who Corm asks about the bakery |
| pell | Pell | fox | the postmaster; has numbered four blue houses and it did not help | to deliver one letter correctly | the letter goes to Nana; he needs to know which house is blue |
| gus | Gus | red squirrel | sells bells and has never heard the big one ring | to hear the big bell | he can be borrowed for an hour; he knows how far sound carries |

### Kettle Springs — the hot pools in the valley's low centre

| id | name | species | who they are | what they want | how it connects |
| --- | --- | --- | --- | --- | --- |
| ivy | Ivy | otter | keeps the pools and has a theory about why they are cooling | the water to stay warm | she is one of two sisters on either side of the springs; she needs the temperature read |
| corm | Corm | raven | reports what he hears and does not check it | the correct version of the news | he asks Orla and Pell, so his errand stitches the hamlet together |
| jory | Jory | deer mouse | has been warm his whole life and is afraid of the cold | to go as far as the pines and come back | his walk is the measure of how far a nervous person can go |

### Windscar Ridge — the exposed crest above the treeline

| id | name | species | who they are | what they want | how it connects |
| --- | --- | --- | --- | --- | --- |
| tuck | Tuck | marten | maintains the bridge and will not cross it | the bridge to hold | he needs the good rope from Bram's station |
| sable | Sable | fox | measures the wind and files a report either way | a reading worth filing | she needs the kite flown and the lantern posts lit; she argues with Tuck about the bridge |

### Brindle Peak — the summit, where the mast stands

| id | name | species | who they are | what they want | how it connects |
| --- | --- | --- | --- | --- | --- |
| edda | Edda | owl | runs the district radio from the lake road | the line fixed, not reported | she is who Nana is trying not to disappoint; she is at the mast |

---

## 3. The errand graph

Twenty-two quests: four in the main story (`the-line`, `the-climb`, `the-mast`, `nana-home`) and eighteen
side errands, one or two per villager. Each is a short walk with a reason, never a single fetch.

The quest list itself lives in `src/data/quests.ts` and nowhere else: giver, zone, blurb, steps, the
condition each step checks, and the reward. Read it there; a copy here would drift. The main story, in
play order: Nana asks Pip to fetch the spare batteries from Bram; Bram wants his woodpile stacked straight
first; Nana lends Pip her lantern for the posts on the climb; Pip carries the batteries to Edda at the mast;
dusk falls; Pip photographs the aurora; Edda's radio reaches the whole valley; then home to Nana, who has
heard what Pip did on the way.

Step text must name its own target (the NPC, the zone, or the activity its condition tests), because the
journal is often the only place the player is told what to do. Conditions and rewards are mechanical and
belong to the game, not the writer.

---

## 4. The mechanical contract

The output is TypeScript, not markdown. It must compile.

### Where the words live

Dialogue is written as JSON in `src/data/dialogue.parts/*.json` (one array of nodes per file, grouped by
zone) and assembled into `src/data/dialogue.ts` with `npx vite-node tools/assemble-dialogue.ts`. Never edit
`dialogue.ts` by hand. Each node is `{ id, speaker, lines, choices?, next?, fill? }` (`DialogueNode` in
`src/core/contracts.ts`). `fill` names a run-time line source in `src/data/dialogueFills.ts`: its lines are
said before the node's own, chosen from what the player has done (Nana's homecoming uses it). After any
change, `npx vite-node tools/story-check.ts` must print clean.

### Hard requirements

- **Entry point per NPC:** every NPC's `dialogue` field in `src/data/npcs.ts` names a node id. Those ids
  must exist in the new file. They are currently `<npc-id>-root` for all 18 NPCs. The writer may rename
  interior nodes freely but must keep the entry ids matching what `npcs.ts` points at, or update `npcs.ts`
  in the same change.
- **Speaker ids:** the `speaker` field is an NPC id from the cast table, or `'pip'` for the player character.
- **Choice cap:** never more than two choices at a branch point. Choices are the only branch points;
  `next` chains without player input.
- **Reachability:** every node must be reachable from some entry point. No orphans.
- **Terminal nodes:** a node with neither `choices` nor `next` ends the conversation. Each NPC needs at
  least one terminal node.
- **Length per node:** the existing content runs 3 lines per node. The writer may choose 2–5; longer than 5
  will overflow the dialogue panel. The panel is fixed-height.
- **Pip's voice:** the player character speaks as `'pip'`, lowercase, terse, a little deadpan. Pip is not
  the writer's mouthpiece and does not narrate.
- **No unearned references:** a line may only name a person, place, object or event the player has already
  been shown — by the narrator (intro card, goal line, zone name), earlier in the same conversation, or by
  another NPC the quest already sent them to. This is mechanically checked by `tools/story-check.ts`.
- **Quest step text** must name its own target: the NPC, the zone, or the activity its condition tests.
- **Branches must matter:** two choices that reach the same node with no difference are a false choice. Cut
  one or make it change something.
- **Rejoins:** where branches rejoin, the node's lines must be true on every incoming branch. If a detail
  differs by path, it cannot appear in the rejoin.

### What is in scope for the writer

- every dialogue node in `src/data/dialogue.parts/`
- the quest `title`, `blurb` and step `text` fields in `src/data/quests.ts` (conditions stay fixed)
- the ending lines in `src/data/endingLines.ts`, the intro card, the ending card, the guide and onboarding
  strings, activity hints and results

What must not change without the lead: the 18 entry points, the quests' step conditions, and the quest
giver/zone mapping.

---

## 5. The craft rules the writer must follow

From the `interactive-fiction` skill's choice-graph reference, applied to this game:

- **Meaningful choices.** Options lead to different consequences or different ways of being Pip. Two
  options that reach the same node with no change are a false choice.
- **Informed choices.** The player can guess what each option means from what is on screen. A choice that
  blindly fails feels unfair.
- **Acknowledged choices.** The node a choice leads to opens by showing the choice was made, even in one
  line.
- **Parallel options.** Keep the two choices similar in length so neither reads as the correct answer.
- **Every path reaches an ending.** No dead ends that strand the player with no way forward.
- **Rejoins converge.** Before two branches rejoin, converge what must converge; what cannot converge stays
  out of the rejoin.

---

## 6. How the writer works

The writer works from beats like these and from what the game does, never from prose handed to them by
anyone else. Changes to the words come back from the writer whole; nobody else edits player-facing text.
