import './App.css'

const PILOT_CITY = 'New Orleans French Quarter'

function App() {
  return (
    <div className="app">
      <main className="shell">
        <header className="masthead">
          <p className="eyebrow">Self-guided ghost tour</p>
          <h1>Haunted Walk</h1>
          <p className="lede">
            A phone-led walk through the dark. The route, the stories, and the narration
            stay on your device.
          </p>
        </header>

        <section className="card" aria-labelledby="status-heading">
          <p className="status">
            <span className="status-dot" aria-hidden="true" />
            Build 01 online
          </p>
          <h2 id="status-heading">The app shell is deployed</h2>
          <p>
            This release installs the PWA, precaches the shell, and points every asset at
            the <code>/haunted-walk/</code> subpath. The tour itself is next:
          </p>
          <ul className="next">
            <li>
              <strong>Map and route</strong>
              <span>Leaflet over OpenStreetMap tiles, with the precomputed route.</span>
            </li>
            <li>
              <strong>Arrival narration</strong>
              <span>Geofence entry starts the stop audio, unlocked by Start Tour.</span>
            </li>
            <li>
              <strong>Stop controls</strong>
              <span>Pause, replay, skip, next stop, and an on-screen transcript.</span>
            </li>
          </ul>
        </section>

        <section className="card card-quiet" aria-labelledby="offline-heading">
          <h2 id="offline-heading">Built for a dead spot</h2>
          <p>
            The app shell and every shipped tour file are precached, so reloading on the
            street works with no signal. Map tiles are cached only as you view them.
          </p>
        </section>
      </main>

      <footer className="footer">
        <p>
          {PILOT_CITY}. No accounts, no analytics. Your location never leaves your device.
        </p>
        <p>
          Map data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>{' '}
          contributors, available under the Open Database License.
        </p>
      </footer>
    </div>
  )
}

export default App
