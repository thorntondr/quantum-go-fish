1. Test disconnection
    1. What happens when someone accidentally hits the back button or exits their browser app?
    1. What if a player actually wants to leave the game?
1. Test mobile
    1. So far all of my tests have been different tabs in desktop Edge on the same machine that's hosting.  I should be able to access it from my phone using the local IP address.
1. Fix player naming
    1. Right now player's can enter a name, but it's never used during gameplay.  Instead the game UI uses sequential single-letter designations.
    1. To avoid ambiguity, player names should be unique, but do we need to enforce that or can we let players sort it out among themselves through whatever communication channel they're using?
1. Let players leave before the game starts
    1. Remove them from the roster and 
    1. Somebody might need to bail or change their name and starting all over wouldn't be fun.
1. Add a button to take you back to the landing page
    1. What should it be called?
    1. Should this be separate from the waiting room exit button?
    1. Should this maintain connection to a game in progress, or disconnect?
1. Let players name suits
    1. The first time is suit is referenced by a player, that player gets to name it.
    1. Suit names should be unique and ideally each should also have a unique one-symbol representation.
1. Come up with a better way to show the game state
    1. It should feel like an actual game.
    a. Research what other mobile recreations of card games look like
    1. Actions for choosing player to ask and suit to ask for need to be more interesting than a drop-down, but still simple and quick.
    1. When I'm choosing who to ask, the currently selected player's hand should be highlighted somehow (larger or outlined or something)
1. Add an info button that shows full instructions on how to play the game