import { Container, getContainer } from '@cloudflare/containers';

export class RecruiterContainer extends Container {
  defaultPort = 8501;
  sleepAfter = '10m';
}

export default {
  async fetch(request, env) {
    // Stable routing keeps Streamlit HTTP uploads and WebSockets on one instance.
    return getContainer(env.RECRUITER, 'recruiter').fetch(request);
  },
};
