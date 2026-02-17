import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("auth/login", "routes/auth.login.tsx"),
  route("error", "routes/error.tsx"),
  route("dashboard", "routes/dashboard.tsx", [
    index("routes/dashboard._index.tsx"),
    route("provision", "routes/dashboard.provision.tsx"),
  ]),
  route("*", "routes/404.tsx"),
] satisfies RouteConfig;
