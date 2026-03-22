𐐘
ඞ
ඩ

Game 1
Third player was able to leave and become inactive and 
Peter was able to reconnect by Joining with the same code
Game state got out of sync somehow, unknown if related to previous two events

Things to test (eventually):
- Leaving while it's your turn to ask
- Leaving while it's your turn to answer

Game 2
Third player left during first turn (not his)
No problems

Question: Should the multi-device flow be split into separate landing, waiting, and playing pages?

Pros
- Each page can be simpler and more focused, with fewer hidden sections and fewer screen-state conditionals.
- Browser refresh and deep-link behavior can be clearer because the URL itself reflects where the user is in the flow.
- Layout can be tailored more aggressively for each phase without carrying unrelated header/footer UI everywhere.
- It becomes easier to show only the controls and messaging relevant to the current phase.

Cons
- Session state and reconnect state have to survive navigation between pages, which increases coordination risk.
- More files, more routing, and more chances for one page to drift visually or behaviorally from the others.
- Multiplayer bugs may get harder to debug because transitions become page navigations instead of local screen switches.
- Page-to-page handoff is another place for players to get stranded if transport/session state is only partially initialized.

Recommendation
- Keep the current single-page multiplayer flow for now.
- Continue trimming phase-specific clutter inside the existing page, which has already been improving the UX.
- Revisit a multi-page split only after the disconnect/reconnect behavior is fully stable, since that state handoff is the main risk.
