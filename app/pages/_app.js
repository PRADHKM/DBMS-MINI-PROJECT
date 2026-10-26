import { SessionProvider } from "next-auth/react";
import Head from "next/head";
import "../styles/globals.css";

export default function App({ Component, pageProps: { session, ...pageProps } }) {
  return <SessionProvider session={session}><Head><title>Workload · Team workspace</title><meta name="description" content="Employee work history, assignments and knowledge continuity." /><meta name="viewport" content="width=device-width, initial-scale=1" /></Head><Component {...pageProps} /></SessionProvider>;
}
