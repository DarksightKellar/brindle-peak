/**
 * What Pip says when an errand is put to Pip and the talk has ended without an answer: after Pip asked
 * the villager a question instead, or when Pip comes back by an offer turned down earlier. The two
 * answers under it stay "i'll do it." and "not now.".
 *
 * Critic round 74 read the old box, `(take on "One Mitten"?)`, as a menu line in the middle of warm
 * talk; Pip says it now. Pip's voice: lowercase, few words, plain speech (data/dialogue.ts).
 */
export const PIP_ASKS: Readonly<Record<string, string>> = {
  'the-line': 'i could go and see bram for the batteries.',
  'hollis-mitten': 'i could go and ask fen, if you like.',
  'wren-sounds': 'i could listen out for something for your last page.',
  'tamsin-headband': 'i could find out if it fits him.',
  'fen-ledger': 'i could look out for it on the trail.',
  'ilsa-kindling': 'i could take it over to your sister.',
  'skiff-sled': 'i could take the sled down the hill.',
  'margit-ice': 'i could do some fishing for you.',
  'orla-flour': 'i could go and ask skiff for the flour.',
  'pell-letter': 'i could take the letter round.',
  'gus-ledger': 'i could ask pell if he heard it.',
  'orla-night-bake': 'i could photograph the lamps for you.',
  'pell-address': 'i could help you sort the houses out.',
  'ivy-springs': 'i could go and see to the dam.',
  'corm-news': 'i could go and check for you.',
  'jory-first-step': 'i could go first, if you like.',
  'tuck-rope': 'i could take the rope up to tuck.',
  'sable-kite': 'i could get your readings for you.',
  'chimney-line': 'i could try the chimney.',
};

/** For an errand without its own line. */
export const PIP_ASK_ANY = 'i could help with that, if you like.';

/**
 * When Pip has already done the errand's first part before it was asked (the dam rebuilt before Ivy
 * mentioned it): critic round 78 heard Ivy say the dam was whole again, then Pip offer to see to the dam.
 */
export const PIP_ASK_REST = "i've done that bit already. i could see to the rest.";
