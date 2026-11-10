import { randomInt } from 'node:crypto';
import { RoomError, RoomService } from './room-service.js';
import { BattleRuleError } from '../../src/tabletop/battle-rules.js';
import { UnsupportedCooldownRuleError } from '../../src/tabletop/cooldown.js';

/** Actions taken during the active adventurer's own turn, including its lockpick checks. */
const TURN_ACTIONS = new Set([
  'deploy', 'begin-turn', 'move', 'engage', 'resolve', 'end-turn', 'escape', 'dismiss-active', 'racial', 'use-item',
  'lockpick-roll', 'lockpick-adjust', 'lockpick-resolve', 'lockpick-stop', 'lockpick-decline', 'cache-item',
]);
/** Class reward choices belong to the player controlling the named adventurer. */
const REWARD_ACTIONS = new Set(['choose-class', 'draw-classes', 'decline-earned-classes']);
/** Start options the host may choose; the engine validates their values. */
const START_OPTIONS = new Set(['setup', 'party', 'difficulty', 'expansions']);
const serverRandom = () => randomInt(0x1_0000_0000) / 0x1_0000_0000;

/** Bind the verified tutorial engine to trusted seats and server-generated dice. */
export async function createJailbreakService({ store, engine } = {}) {
  const { createJailbreak, reduceJailbreak, JailbreakError } = engine ?? await import('../../src/tabletop/engine.js');
  const translate = callback => {
    try { return callback(); } catch (error) {
      if ((JailbreakError && error instanceof JailbreakError) || error instanceof BattleRuleError || error instanceof UnsupportedCooldownRuleError) {
        throw new RoomError(error.code, error.message, 400);
      }
      throw error;
    }
  };
  return new RoomService({
    store,
    maxPlayers: 2,
    createGame(options, context) {
      if (Object.keys(options).some(key => !START_OPTIONS.has(key))) {
        throw new RoomError('UNSUPPORTED_OPTIONS', 'Only the setup, party, difficulty and expansion classes can be chosen.');
      }
      if (context.players.length > 2) throw new RoomError('SCENARIO_PLAYER_LIMIT', 'This encounter supports one or two human players.', 409);
      // The server draws the standard setup's enemies; clients never supply them.
      return translate(() => createJailbreak({ ...options, players: context.players, random: serverRandom }));
    },
    authorizeAction(state, action, context) {
      if (action.type === 'defend') {
        return state.heroes.find(hero => hero.id === state.pending?.heroId)?.ownerSeat === context.seat;
      }
      if (REWARD_ACTIONS.has(action.type)) {
        return state.heroes.find(hero => hero.id === action.heroId)?.ownerSeat === context.seat;
      }
      return TURN_ACTIONS.has(action.type) && state.heroes[state.activeHero]?.ownerSeat === context.seat;
    },
    reduceGame(state, action) {
      return translate(() => reduceJailbreak(state, action, { random: serverRandom }));
    },
  });
}
