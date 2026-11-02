
describe('the goal point (compass, world marker, camera)', () => {
  const MAIN: GuideContent = { ...CONTENT, quests: [{ ...CONTENT.quests[0], main: true }, ...CONTENT.quests.slice(1)] };

  it('is the opener before the story starts, then the story step, then nothing', () => {
    const g = state();
    expect(goalTarget(g, SPAWN, MAIN)).toEqual({ x: -352, z: 348 });
    talk(g, 'nana');
    g.quests['the-line'] = { status: 'active', step: 0, base: 1 };
    expect(goalTarget(g, SPAWN, MAIN)).toEqual({ x: -340, z: 306 });
    g.quests['the-line'] = { status: 'complete', step: 2 };
    expect(goalTarget(g, SPAWN, MAIN)).toBeNull();
  });
});
