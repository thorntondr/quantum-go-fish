
SUIT_SIZE = 4
N = 3
cards = [0]*N
min_cards = [[0]*N]*N
max_cards = [[SUIT_SIZE]*N]*N

def ask(P,Q,S):
    assert(max_cards[P][S] > 0)
    min_cards[P][S] = max(1, min_cards[P][S])
    propagate()

def answer(Q,P,S,yes):
    if yes:
        assert(max_cards[Q][S] > 0)
        min_cards[Q][S] = max(1,min_cards[Q][S])
        cards[Q] -= 1
        cards[P] += 1
        min_cards[Q][S] -= 1
        max_cards[Q][S] -= 1
        min_cards[P][S] += 1
        max_cards[P][S] = max(max_cards[P][S] + 1, SUIT_SIZE)
    else:
        assert(min_cards[Q][S] == 0)
        max_cards[Q][S] = 0
    propagate()
