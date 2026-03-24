- [ ] Revisit disconnection design
    - [ ] BUG: When we tried to host from the family PC or from Peter's chromebook, the other of the two was not able to join.  It appeared to put them in another room (see above).
- [ ] Add UI to intial screen for single device and multi-device waiting room screen to control optional rules.
Optional rules variants to try (can be implemented one at a time):
    - [x] Max 3: All player's per-suit maximums start at 3 instead of 4.  This means that you will need to acquire at least one card from an opponent to get four of a kind.
    - [ ] All or nothing: When answering "Yes," you must transfer all of your cards of that suit.  This means that in addition to saying "Yes," you must also pick a number in the range [min, max].
    - [ ] Draw Pile: Add one extra suit to the deck and a draw pile of four cards.  When an oppoent says "No," you have to go fish.  The draw pile can be tracked in the game state and display as if it were an extra player, but it does not take turns.
        - [ ] How is the transfer accomplished?  Is one of the draw pile's potential suits randomly selected and collapsed before transfer?  Is there some way to transfer the possibilities of a card instead?
    - [ ] Dummy player: Similar to a draw pile, but simpler as the cards in the dummy player's hand are inaccessible.  A dummy player is just a player that is inactive to begin with.
