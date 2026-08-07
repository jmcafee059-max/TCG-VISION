#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Build a mobile app: a real-time Pokémon TCG card price checker app which can be set up on a stand.
  Using a continuous camera feed, an AI must identify the card, pull its info and price, and read
  the price out loud. It also needs a live voice conversation system to listen to questions and
  answer without typing.

  Iteration 22 (this session) added three features that need verification:
  1. Candidate Picker — when a scan is ambiguous (same collector number exists across multiple
     English sets), the Card Panel exposes a list of tappable set chips. Tapping a chip calls
     POST /api/scan-card/pick and replaces the displayed card with the selected printing.
  2. Voice Announcement on Lock — when a card locks, if `announceOnLock` + `voiceEnabled` are on,
     the app calls POST /api/voice-chat with a pre-composed line (name + set + market price) and
     plays back the returned TTS audio. Must fire ONCE per unique {name, number}.
  3. Session Batch Mode — when `batchMode` is on, each newly locked card's market price is added
     to a running session total shown in a strip at the top of the Scanner screen. A RESET button
     zeros the total. The strip must NOT double-count when the same card re-locks.

backend:
  - task: "POST /api/scan-card — vision + JustTCG pricing + ambiguity detection"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "testing"
        comment: "Iter 21: 5/5 Pikachu Base 58 scans returned image_url + correct 058/102 + price=$7.35. Non-card gracefully returns identified=false. Vision model = claude-sonnet-4-5 (locked). fetch_english_image has multi-query fallback + 5xx retry + number-match preference."
      - working: "NA"
        agent: "main"
        comment: "Iter 22: Endpoint now also returns candidates[] and ambiguous=true when the same collector number is found in multiple English sets (server.py:546-582). Needs re-verification that ambiguity payload shape is correct."

  - task: "POST /api/scan-card/pick — candidate picker resolver"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Iter 22 (new endpoint at server.py:755-780). Accepts {name, set_name, number, language} and returns the exact matching card printing with image + price. Backend python script validated the endpoint returns correct payload; needs testing_agent verification against real ambiguous cards like Pikachu (Base) vs Pikachu (Base Shadowless)."

  - task: "POST /api/voice-chat — TTS announce path"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "testing"
        comment: "Iter 21: voice-chat tested 2x, both returned audio_base64 + reply. TTS voice selectable via `voice` param."
      - working: "NA"
        agent: "main"
        comment: "Iter 22: Called with a pre-formed announce line — no schema change but re-verify that non-card contextual line still produces audio."

  - task: "Collection CRUD, graded-prices, grade-estimate (regression)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "Iter 21: 22/22 backend tests green — collection CRUD 5/5, graded-prices 2/2, grade-estimate 2/2, non-strict 2/2, voice/transcribe 3/3. No regressions expected in iter 22."

frontend:
  - task: "Candidate Picker chips on ambiguous scan"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "New UI at index.tsx:673-707. Renders a horizontal chip list with testID=`alt-candidate-{i}` inside a container testID=`ambiguous-block` whenever card.ambiguous && candidates.length>0. Tap calls pickCandidate() and replaces displayed card. Needs verification that chips render, tap works, and no infinite render loop."

  - task: "Voice Announcement on Lock"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "index.tsx:224-240 announces once per unique {name|number} key via lastAnnouncedKeyRef. Guarded by settingsRef.current.announceOnLock && voiceEnabled. Toggle located in Settings screen testID=`announce-lock-switch`."

  - task: "Session Batch Mode strip"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Strip rendered at index.tsx:481-500 with testIDs `batch-strip` and `batch-reset-btn`. Batch total increments in the `changed` branch at index.tsx:220-223 so re-locks of the same card do NOT double-count. Toggle at settings.tsx testID=`batch-mode-switch`."

  - task: "Scanner tutorial + primary scan loop (regression)"
    implemented: true
    working: true
    file: "/app/frontend/app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Tutorial and scan loop remain from iter 20 — screenshot confirms tutorial renders on first boot. Existing testIDs preserved: rescan-btn, add-to-collection-btn, no-price-msg, price-source."

metadata:
  created_by: "main_agent"
  version: "1.2"
  test_sequence: 22
  run_ui: true

test_plan:
  current_focus:
    - "POST /api/scan-card/pick — candidate picker resolver"
    - "POST /api/scan-card — vision + JustTCG pricing + ambiguity detection"
    - "Candidate Picker chips on ambiguous scan"
    - "Voice Announcement on Lock"
    - "Session Batch Mode strip"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Iteration 22 introduces three new UX features on top of the iter-21-verified scan pipeline:
      (1) Candidate Picker chips for ambiguous scans, (2) Voice-on-lock announcement,
      (3) Session Batch Mode. Backend changes are additive: a new POST /api/scan-card/pick
      endpoint and an `ambiguous`+`candidates[]` payload on /api/scan-card. Nothing pre-existing
      should regress.

      Please verify:
        BACKEND
        - POST /api/scan-card/pick with a valid {name, set_name, number, language:"english"}
          returns 200 with a fully populated CardInfo (image_url, price.market non-null when
          available, correct set_name echoed back). Try Pikachu / Base / 58 as a canonical case.
        - Trigger an ambiguity: pick a name+number that legitimately exists in >1 English set
          (Pikachu 025 is a candidate). Verify /api/scan-card returns candidates length > 1
          (fed a text-only synthetic scan payload if needed — but the more reliable path is
          real image; fall back to unit-testing the internal ambiguity code path if the vision
          call is flaky in CI).
        - Full regression on health, root, non-card graceful, blurry graceful, history,
          transcribe, voice-chat, collection CRUD, graded-prices, grade-estimate.

        FRONTEND
        - Boot the app, dismiss tutorial (SKIP). Verify batch strip is hidden by default.
        - Open Settings, toggle `batch-mode-switch` ON, return to Scanner: `batch-strip`
          becomes visible with $0.00 / 0 cards and a `batch-reset-btn`.
        - Toggle `announce-lock-switch` ON. Set `voice-enabled-switch` ON. Return to Scanner.
        - Camera is not available in the CI browser — do not attempt to physically scan.
          Instead, confirm the UI structure renders without JS errors and no infinite
          useEffect loops. Console logs must be clean of React warnings.
        - Navigate between all tabs (Scanner, Collection, Settings). No crash.
        - Take screenshots after each step.

      Do NOT change the vision model (must remain claude-sonnet-4-5).
      Do NOT modify metro.config.js, .env EXPO_PACKAGER_* vars, or backend MONGO_URL.

  - agent: "main"
    message: |
      Iteration 23 (this run): User reports "the right card comes up but no price is shown".
      Root cause: strict-match gate in /api/scan-card was too conservative — when the vision
      read a card name correctly but the collector-number or set didn't strictly match a
      JustTCG record, we suppressed the price entirely.

      Fixes applied (all backend + minor frontend):
        server.py:
        - _best_variant_price now heavily weights variants that HAVE a price (was +5, now +40)
          AND filters to priced variants first if any exist. Previously a Near Mint variant
          with NO price could outrank a Lightly Played variant with a price.
        - fetch_price_and_meta always populates alt_matches[] on non-strict paths (top-4
          distinct-set candidates from ranked results) so the picker is always available.
        - /api/scan-card non-strict branch: now returns the best-effort price + candidates
          list + price_source ending in " · closest match · approximate". reasoning explains
          it's approximate. Previously non-strict returned NO price at all.

        index.tsx:
        - Added `APPROX PRICE` chip (testID: approx-price-chip) that shows when
          price_source contains "approximate".
        - Updated ambiguous-block header text: "Pick the exact set for a confirmed price:"
          in the approximate case, keeps original text in the strict-multi-set case.

      Please verify:
        BACKEND
        - /api/scan-card with a real Pikachu Base 58 image → strict path unchanged (price
          populated, no APPROX label, ambiguous=false).
        - /api/scan-card where vision returns name-only (or misread number) → non-strict path
          now returns price.market != null AND price_source ends in "approximate" AND
          candidates.length >= 1.
        - /api/scan-card/pick with one of the returned candidates → returns exact match with
          real market price and price_source ending in " · picked".
        - Full regression: existing 30 tests should still pass (test_iter20 tests may still
          be strict-match so no change expected there).

        FRONTEND
        - App loads, tutorial dismisses, all 4 tabs render.
        - `approx-price-chip` testID exists in the render tree (only visible when the current
          card has approximate price — hard to trigger without a real scan, so just verify
          the code path doesn't crash and the chip style renders correctly if forced).
        - Settings toggles (announce-lock-switch, batch-mode-switch) still work.

      Save report as /app/test_reports/iteration_23.json.