import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth";
import { sectionFor } from "../navigation";
import { RouteTabs } from "./ui";

export default function Hub() {
  const { me } = useAuth();
  const { pathname } = useLocation();
  const section = me ? sectionFor(me.active_role, pathname) : undefined;
  const isTabPage = section?.tabs?.some((t) => t.to === pathname);
  return (
    <>
      {section?.tabs && isTabPage && <RouteTabs tabs={section.tabs} />}
      <Outlet />
    </>
  );
}
