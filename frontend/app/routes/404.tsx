import { Link } from "react-router";
import { HouseIcon } from "lucide-react";
import { Image } from "@unpic/react";

export default function NotFound() {
  return (
    <div className="flex flex-col justify-center h-dvh text-center">
      <Image
        className="absolute right-10 top-10"
        src="/favicon.ico"
        width={90}
        height={90}
        alt=""
      />
      <div className="">
        <h1 className="text-primary font-bold font-mono text-[200px]">404</h1>
        <p className="text-gray-500 mb-10">Page not found</p>
        <Link
          className="flex flex-row space-x-2 justify-center hover:text-primary transition transition-colors"
          to="/"
        >
          <HouseIcon className="" />
          <span>Go Home</span>
        </Link>
      </div>
    </div>
  );
}
