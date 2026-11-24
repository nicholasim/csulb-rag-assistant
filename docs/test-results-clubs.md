# Test Results: CSULB Services RAG Assistant (tests/club-and-gaming-questions.json)

Run on 11/24/2026, 2:28:26 PM (Pacific) with `npm run test:questions`, against http://localhost:3100.

**4 of 6 passed** (clubs 3/5, gaming 1/1). Gemini models that answered: gemini-3.5-flash-lite.

Response time with Gemini (6 questions): average 3.3s, median 3.7s, slowest 4.5s. (Times don't include the wait before a retry.)

Each test is checked automatically: the response type (answer / clarify / fallback / error), facts that must appear, and text that must not appear. The checks are listed in `tests/club-and-gaming-questions.json`. If Gemini is rate-limited or overloaded, the script waits 30 seconds and retries once; those rows say "(retried once)" in the Model column.

| # | Question | Type | Expected behavior | Expected fact | Actual | Result | Model | Time |
|---|---|---|---|---|---|---|---|---|
| 1 | I'm Cambodian, how can I get involved with my culture on campus? | clubs | Answer naming the Cambodian Student Society (from the official Cambodian Graduation Celebration page, Entry 35) and the Asian, Pacific Islander, and Desi Resource Center, cited. No other Cambodian club named (none is on an official page). No 'contact details were removed' note, and no Engineering or Liberal Arts club page cited. A BeachSync search for a Cambodian keyword. | The Cambodian Student Society invites any Cambodian identifying students to join them | [searched: "I'm Cambodian, how can I get involved with my culture on campus?" + "Cambodian student organizations Student Life and Development" + "cultural student organizations clubs CSULB"] answer: You can get involved with your culture through the Cambodian Student Society (CSS), which organizes cultural shows and hosts an annual gr... (3 sources) [BeachSync: "Cambodian"] [follow-ups: "What does the Cambodian Student Society do?" \| "How do I explore all student organizations?"] | **FAIL** | gemini-3.5-flash-lite | 3.7s |
| 2 | I'm a CS student, what clubs can help me gain experience? | clubs | Names at least one club from the Engineering Student Clubs & Organizations page (for example ACM or the Video Game Development Club), cited. A BeachSync search. | Association for Computing Machinery (ACM) | [searched: "I'm a CS student, what clubs can help me gain experience?" + "Computer Science student clubs" + "Student Life and Development student organizations"] answer: Computer science students can gain hands-on experience by joining technical organizations such as the [Association for Computing Machiner... (2 sources) [BeachSync: "computer science"] [follow-ups: "What does the ACM club do?" \| "Where can I find more student clubs?"] | PASS | gemini-3.5-flash-lite | 4.5s |
| 3 | is there a chess club | clubs | No source lists a chess club: says our CSULB pages don't list one (or falls back), never invents one. A BeachSync search for chess. | - | [searched: "is there a chess club" + "chess club Student Life and Development"] answer: Our CSULB pages do not list a chess club. However, all student organizations at CSULB can be found on [BeachSync](http://beachsync.com/) ... (1 source) [BeachSync: "chess"] | PASS | gemini-3.5-flash-lite | 3.4s |
| 4 | clubs for nursing students | clubs | Names the nursing student association from the Health & Human Services Student Organizations page, cited. A BeachSync search for nursing. | California Nursing Students' Association (CNSA) | [searched: "clubs for nursing students" + "nursing student organizations Student Life and Development" + "School of Nursing student clubs"] answer: For nursing students, the California Nursing Student Association (CNSA) is available to help students stay connected, build community, an... (1 source) [BeachSync: "nursing"] | PASS | gemini-3.5-flash-lite | 2.1s |
| 5 | is there an underwater basket weaving club | clubs | No such club in our sources: says so (or falls back), never invents one. A BeachSync search. | - | [searched: "is there an underwater basket weaving club" + "Student Life and Development clubs and organizations"] answer: Our CSULB pages do not list an underwater basket weaving club. You can find all student organizations on [BeachSync](http://beachsync.com... (1 source) | **FAIL** | gemini-3.5-flash-lite | 2.2s |
| 6 | where can i play video games on campus | gaming | Answer from the ASI Games Area page: the Games Center is closed for the FUTURE U Project and the Esports Lounge moved to Peterson Hall 1 (PH1) Room-218. Or, if it falls back, Who can help = ASI. Never a Tuition and Fees button. | Esports Lounge will be relocated to Peterson Hall 1 (PH1) Room-218 | [searched: "where can i play video games on campus" + "Student Recreation and Wellness Center esports gaming" + "campus places video games lounge"] answer: The Esports Lounge has been relocated to Peterson Hall 1 (PH1) Room-218. The Games Center is closed for the FUTURE U Project until it reo... (2 sources) [follow-ups: "When will the Games Center reopen?" \| "What are the hours for Peterson Hall 1?"] | PASS | gemini-3.5-flash-lite | 3.9s |

## Failures

### #1: I'm Cambodian, how can I get involved with my culture on campus?

- Problems: missing /Asian, Pacific Islander,? and Desi/
- Full answer: You can get involved with your culture through the Cambodian Student Society (CSS), which organizes cultural shows and hosts an annual graduation celebration for Cambodian students [1]. You can also explore all student organizations at CSULB by checking Beach Sync on your Single Sign-On dashboard [2]. To learn more about cultural events, visit the Cultural Celebrations website [3].

### #5: is there an underwater basket weaving club

- Problems: expected a BeachSync search matching /basket|weaving/, got none
- Full answer: Our CSULB pages do not list an underwater basket weaving club. You can find all student organizations on [BeachSync](http://beachsync.com/) [1].

