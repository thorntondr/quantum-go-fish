- [ ] Revisit disconnection design
    - [ ] BUG: When we tried to host from the family PC or from Peter's chromebook, the other of the two was not able to join.  It appeared to put them in another room (see above).
- [x] "Return Home" and "Leave Game" buttons seem redundant
- [x] Add an info button that shows full instructions on how to play the game
- [x] BUG: If I type in another host's room id and press "Host" it opens a new room with the same id. Solution: Remove the ability for the Host to choose their own room code.
- [ ] When both win conditions are met simultaneously by the same player, the Game Over message should reflect that.
- [x] Better UI to let you know when it's your turn to ask or answer
- [x] Clearer indication of game over state
- [x] The display of other player's hands should start with the player who goes after you, rather than starting with the host player on every device.
- [x] When answering a question, the question being asked should be more clearly displayed.  In single_device_ui.html there is no indication at all what the question is.
- [ ] Optional rules variants to try, controllable by host via check list in waiting room. Can be implemented one at a time.
    - [ ] Max 3: All player's per-suit maximums start at 3 instead of 4.  This means that you will need to acquire at least one card from an opponent to get four of a kind.
    - [ ] All or nothing: When answering "Yes," you must transfer all of your cards of that suit.  This means that in addition to saying "Yes," you must also pick a number in the range [min, max].
    - [ ] Draw Pile: Add one extra suit to the deck and a draw pile of four cards.  When an oppoent says "No," you have to go fish.  The draw pile can be tracked in the game state and display as if it were an extra player, but it does not take turns.
        - [ ] How is the transfer accomplished?  Is one of the draw pile's potential suits randomly selected and collapsed before transfer?  Is there some way to transfer the possibilities of a card instead?
- [ ] BUG: If a player runs out of cards, their turn should be skipped.

## Audit follow-up

- [x] Fix the single-device status line so its custom "awaiting answer" and "viewing player" message is not overwritten by the shared renderer.
- [x] Remove unused `SessionMessage` and `PeerStatus` declarations from `src/app/sessionController.ts`.
- [x] Remove or wire up unused UI/session helpers such as `src/ui/turnController.ts`, `src/ui/interaction.ts`'s exported `submitMove`, and the write-only `peerByClient` map if it is not needed.
- [x] Decide whether `web/debug.html` should remain supported by `src/web/main.ts`, and either align it with the shared UI contract/styles or retire it.
- [x] Add session-controller tests for `leave_game`, reconnect and seat-claim expiry, and `restartGame()` clearing per-game metadata.
