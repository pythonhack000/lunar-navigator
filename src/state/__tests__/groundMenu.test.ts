import { beforeEach, describe, expect, test } from 'vitest';
import { isInvitingToAsk, isPulsingToAsk, useNavigator } from '../store';

describe('the pulse around LUNA', () => {
  beforeEach(() => useNavigator.setState({ isGroundMenuOpen: false, hasOpenedGroundMenu: false, groundSpeech: null, isTouring: false }));

  test('stays after her questions have been opened once, unlike the label', () => {
    useNavigator.getState().setGroundMenuOpen(true);
    useNavigator.getState().setGroundMenuOpen(false);
    expect(isInvitingToAsk(useNavigator.getState())).toBe(false);
    expect(isPulsingToAsk(useNavigator.getState())).toBe(true);
  });

  test('stops while she talks, while her questions are open, and during the tour', () => {
    useNavigator.setState({ groundSpeech: { text: 'Hello', point: null } });
    expect(isPulsingToAsk(useNavigator.getState())).toBe(false);
    useNavigator.setState({ groundSpeech: null, isGroundMenuOpen: true });
    expect(isPulsingToAsk(useNavigator.getState())).toBe(false);
    useNavigator.setState({ isGroundMenuOpen: false, isTouring: true });
    expect(isPulsingToAsk(useNavigator.getState())).toBe(false);
  });
});

describe('the invitation to ask LUNA', () => {
  beforeEach(() => useNavigator.setState({ isGroundMenuOpen: false, hasOpenedGroundMenu: false, groundSpeech: null, isTouring: false }));

  test('waits until she has finished talking', () => {
    useNavigator.setState({ groundSpeech: { text: 'We are here', point: null } });
    expect(isInvitingToAsk(useNavigator.getState())).toBe(false);
    useNavigator.setState({ groundSpeech: null });
    expect(isInvitingToAsk(useNavigator.getState())).toBe(true);
  });

  test('stays away during the tour, and once her questions have been opened', () => {
    useNavigator.setState({ isTouring: true });
    expect(isInvitingToAsk(useNavigator.getState())).toBe(false);
    useNavigator.setState({ isTouring: false, hasOpenedGroundMenu: true });
    expect(isInvitingToAsk(useNavigator.getState())).toBe(false);
  });

  test('stays until her questions have been opened', () => {
    expect(useNavigator.getState().hasOpenedGroundMenu).toBe(false);
    useNavigator.getState().setGroundMenuOpen(false);
    expect(useNavigator.getState().hasOpenedGroundMenu).toBe(false);
  });

  test('is gone for good once they have been opened, even after they close', () => {
    useNavigator.getState().setGroundMenuOpen(true);
    expect(useNavigator.getState().hasOpenedGroundMenu).toBe(true);
    useNavigator.getState().setGroundMenuOpen(false);
    expect(useNavigator.getState().isGroundMenuOpen).toBe(false);
    expect(useNavigator.getState().hasOpenedGroundMenu).toBe(true);
  });
});
