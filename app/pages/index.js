import { getServerSession } from "next-auth/next";
import { authOptions } from "./api/auth/[...nextauth]";

export default function Index() {
  return null; // never rendered — getServerSideProps always redirects
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions);
  return {
    redirect: {
      destination: session ? "/dashboard" : "/login",
      permanent: false,
    },
  };
}
