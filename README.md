# MESA Technical Quiz 2026 - setup

## 1. Google Sheet (stores every answer)
1. Create a new Google Sheet named "MESA Quiz 2026".
2. Extensions > Apps Script. Delete the default code, paste everything from `apps-script.gs`.
3. Change `SECRET` on line 2 to your own random text.
4. Deploy > New deployment > type "Web app". Execute as: Me. Who has access: Anyone. Deploy and authorise.
5. Copy the Web app URL (ends in /exec).

## 2. Put the code on GitHub
Create a repository and upload everything in this folder (server.js, package.json, public/, apps-script.gs).

## 3. Deploy on Render
1. New > Web Service > connect the repository.
2. Build command: `npm install`   Start command: `npm start`
3. Environment variables:
   - HOST_PASSWORD = your host password
   - SHEET_URL = the Web app URL from step 1
   - SHEET_SECRET = the same secret you put in the script
4. Deploy. Your quiz is at https://<your-service>.onrender.com

## 4. Run the event
- Open `/#/host`, log in, set up the quiz, save, and give each team its code.
- Teams open the link, pick their team, enter the code and press Start.
- Open one round at a time from the Host page.
- Sheet tab "Results" fills live. Optional leaderboard tab: in a new sheet tab put
  =QUERY(Results!B:G,"select B, sum(G) where B is not null group by B order by sum(G) desc label sum(G) 'Total'",1)

## Notes
- Render's free plan sleeps after inactivity. Open the site 5 minutes before the event, or ping it with UptimeRobot.
- If the server restarts, it restores the quiz and all scores from the Google Sheet.
