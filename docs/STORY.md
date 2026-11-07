# The valley, the people, and how they talk

Revision 1. Written after the player said, of the shipped dialogue: "Nothing any of the NPCs have said
makes a single sense in any shape whatsoever… it's just random string of words put together."

**That diagnosis is correct, and the cause is visible in the data.** Every NPC was written in isolation,
as three clipped fortune-cookie fragments, with no rule about what the player already knows. So Nana says
"Last truck through" to a bird who has not arrived on a truck; Edda and "the district" appear with no
introduction; the mast is an "errand" before anyone says what the mast is for. Each line is a vibe. There
is no through-line because none was specified.

## The rule that was missing

**A line may only refer to something the player has already been shown.** Not "keep it simple" — that is
an adjective. This: if an NPC names a person, a place, an object or an event, that thing has been
established on screen before the line, in this order of preference:

1. by the narrator (the intro card, the goal line, a zone name);
2. by this NPC earlier in the same conversation;
3. by another NPC the quest has already sent you to.

Anything else is a violation, and it is mechanically checkable — see the checker at the bottom.

## The story, in five sentences

Pip is a snow bunting who has come up the valley road to spend a winter with Nana Quill, who raised her.
The valley's radio line is down, so nobody below the pass knows whether the road will be cleared before
the snow closes it, and Nana is too old to climb to the mast to fix it. She asks Pip to walk the valley,
gather what the mast needs from the people who have it, and climb Brindle Peak to put it back on the air.
What Pip finds is that the things the mast needs are the things people have been too polite to ask each
other for. The climb is the errand; the valley knitting itself back together is the game.

## Who wants what, and why it connects

Each NPC has one errand, and every errand is either a piece of the mast or a thread that another NPC
picks up. State it in one sentence before writing a line of dialogue.

| NPC | Who they are, in one line | Wants | Connects because |
| --- | --- | --- | --- |
| Nana Quill | Pip's grandmother; keeps the cabin at the road head | The radio line back on before the snow | She cannot make the climb |
| Bram | Squirrel; counts the firewood, badly | The count to be right | The mast's batteries are in his woodstore |
| Hollis | Neighbour; lost a mitten and suspects the wind | The mitten back | The mitten is in the pines where Fen sits |
| Fen | Quiet; watches the pines and admits nothing | To be asked something directly | He saw where the mitten went |
| Wren | Keeps a field notebook of the valley | A page worth writing down | She knows the mast's history |
| Edda | Runs the district radio from the lake road | The line fixed, not reported | She is who Nana is trying not to disappoint |
| Ilsa / Ivy | Sisters on either side of the springs | A parcel delivered without a row | Their errand is what gets the valley talking again |

Fill in the rest from `src/data/npcs.ts`, but every row must have that third column filled. An NPC with
no connection is a stranger saying a riddle.

## Voice

Warm, direct, unhurried. People who live somewhere cold and know each other well: they do not explain
themselves, but they do answer questions. It is a cozy game, and people in it talk the way people talk:
whole sentences, with the little words left in ("Oh, there you are", "would you", "mind", "you know").
They are in no hurry and are not trying to say things in as few words as possible.

**No tagline diction (the director's rule).** Nobody speaks in clipped fragments stacked for effect
("Thinner. The road does that."), punchy closers ("That's not hearsay. That's bells."), or aphorisms
("Winter wants one."). If a line sounds like a trailer, a poster or a writer being clever, rewrite it as
something a real neighbour would say across a kitchen table. Character quirks stay (Bram counts, Margit
measures, Jory speaks formally), but they come out in ordinary speech.

**No line may be a non-sequitur.** If you cannot say what the previous line said and what this line answers,
delete the line.

### Before (shipped — every line is an allusion to something unestablished)

> Nana: "You made it. Last truck through."
> Nana: "Line's down. Whole valley."
> Nana: "Kettle's on. Boots off."

### After (the target: everything grounded, said the way a person would say it)

> Nana: "There you are. I heard the truck go back down without you on it."
> Nana: "You walked up from the road head? In this? Sit down before you argue with me."
> Nana: "The radio's been dead since Tuesday. Whole valley's deaf until someone climbs to the mast, and
> my knees are done arguing with that hill."

The difference is that a truck exists because she mentions it arriving, the road head is
established as where Pip came from, and the mast is introduced as an object before it becomes an errand.

## Writing a conversation

Each NPC conversation states, in order:

1. **Who they are** — one line, in their own words, that a stranger could understand. ("I count the wood.")
2. **What they want** — one line, concrete. ("I'm two logs short and it's eating me.")
3. **What they offer or ask** — the quest step, naming the *who* and the *where*. ("Ask Hollis. He was
   stacking with me Tuesday.")
4. **A payoff line** for when the errand is done — a change in the world, not a thank-you. ("Nine
   hundred and eight. I'm sleeping tonight.")

Choices must be two things a real person might say, not "yes/no". If a choice exists only to be polite,
cut it and write one line.

## Acceptance, mechanically

`tools/story-check.ts` (to be written) walks `src/data/dialogue.ts` and fails on:

- any proper noun in a line that is not in the introduced set for that NPC at that point. Introduced =
  narrator terms (mast, valley, cabinh, road, peak, the seven zone names, Pip, Nana) + names introduced in
  an earlier node of the same conversation;
- any node whose first line is not a complete sentence (heuristic: starts with a capital, contains a verb);
- any quest step whose text does not name its target NPC or zone.

The checker is the point. The previous version of this content passed every test the project had, because
no test read the writing.
