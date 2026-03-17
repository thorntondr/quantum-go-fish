1. Revisit disconnection design
    1. BUG: When we tried to host from the family PC or from Peter's chromebook, the other of the two was not able to join.  It appeared to put them in another room (see above).
1. "Return Home" and "Leave Game" buttons seem redundant.  Consider reworking this part of the design.
1. Add an info button that shows full instructions on how to play the game
1. BUG: If I type in another host's room id and press "Host" it opens a new room with the same id.
    1. Consider removing the ability for the Host to choose their own room code.
1. Peter says there should be a special message for meeting both win conditions at the same time
1. Better UI to let you know when it's your turn to ask or answer
1. Clearer indication of game over state
1. The turn order should be apparant from the layout of the players' hands.  They currently just show in turn order, starting with the Host (or second player on the Host's UI).
1. When answering a question, the question being asked should be more clearly displayed.  In single_device_ui.html there is no indication at all what the question is.
1. Optional rules variants to try, controllable by host via check list in waiting room. Can be implemented one at a time.
    1. Max 3: All player's per-suit maximums start at 3 instead of 4.  This means that you will need to acquire at least one card from an opponent to get four of a kind.
    1. All or nothing: When answering "Yes," you must transfer all of your cards of that suit.  This means that in addition to saying "Yes," you must also pick a number in the range [min, max].
    1. Draw Pile: Add one extra suit to the deck and a draw pile of four cards.  When an oppoent says "No," you have to go fish.  The draw pile can be tracked in the game state and display as if it were an extra player, but it does not take turns.
        1. How is the transfer accomplished?  Is one of the draw pile's potential suits randomly selected and collapsed before transfer?  Is there some way to transfer the possibilities of a card instead?
1. In the "Customize Suit" modal dialog, the 'Color' button just shows a horizontal line.  It would be cool if it showed the selected (initially default) color.