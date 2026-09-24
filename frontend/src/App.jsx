import { Suspense, lazy } from "react";
import { RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/context/ThemeContext";
import { AuthProvider } from "@/context/AuthContext";
import { UIProvider } from "@/context/UIContext";
import { CompanyProvider } from "@/context/CompanyContext";
import { OutboxProvider } from "@/context/OutboxContext";
import { UndoProvider } from "@/context/UndoContext";
import { router } from "@/routes";
import { isPortal } from "@/lib/portal";

// dev.sentryfi.app is the developer portal and nothing else (pages/DeveloperPortal.jsx).
const DeveloperPortal = lazy(() => import("@/pages/DeveloperPortal"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

export default function App() {
  if (isPortal()) {
    return (
      <Suspense fallback={null}>
        <DeveloperPortal />
      </Suspense>
    );
  }
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <UIProvider>
          <AuthProvider>
            {/* Inside AuthProvider: which companies you belong to depends on who
                you are, and the header it sets must be on every request the
                router makes. */}
            <CompanyProvider>
              {/* Inside CompanyProvider: what is waiting to send belongs to a
                  company, and sending it needs the request header. */}
              <OutboxProvider>
                {/* The ten-second undo outlives the sheet that started it:
                    the confirm loop ends by returning Home, and the offer has
                    to still be there when it does. */}
                <UndoProvider>
                  <RouterProvider router={router} />
                </UndoProvider>
              </OutboxProvider>
            </CompanyProvider>
          </AuthProvider>
        </UIProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
