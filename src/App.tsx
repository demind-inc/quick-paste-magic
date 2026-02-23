import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";

import LoginPage from "./pages/Login";
import SignupPage from "./pages/Signup";
import CreateWorkspacePage from "./pages/CreateWorkspace";
import SnippetsPage from "./pages/Snippets";
import SnippetEditorPage from "./pages/SnippetEditor";
import SettingsPage from "./pages/Settings";
import TeamSettingsPage from "./pages/TeamSettings";
import ExtensionSettingsPage from "./pages/ExtensionSettings";
import NotFound from "./pages/NotFound";
import AcceptInvitePage from "./pages/AcceptInvite";

const queryClient = new QueryClient();

function ProtectedApp({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <WorkspaceProvider>
        <AppLayout>{children}</AppLayout>
      </WorkspaceProvider>
    </ProtectedRoute>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/accept-invite" element={<AcceptInvitePage />} />

            {/* Protected: create workspace when user has none (no sidebar) */}
            <Route
              path="/create-workspace"
              element={
                <ProtectedRoute>
                  <WorkspaceProvider>
                    <CreateWorkspacePage />
                  </WorkspaceProvider>
                </ProtectedRoute>
              }
            />
            {/* Protected routes (require workspace; redirect to /create-workspace if none) */}
            <Route
              path="/snippets"
              element={
                <ProtectedApp>
                  <SnippetsPage />
                </ProtectedApp>
              }
            />
            <Route
              path="/snippets/new"
              element={
                <ProtectedApp>
                  <SnippetEditorPage />
                </ProtectedApp>
              }
            />
            <Route
              path="/snippets/:id/edit"
              element={
                <ProtectedApp>
                  <SnippetEditorPage />
                </ProtectedApp>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedApp>
                  <SettingsPage />
                </ProtectedApp>
              }
            />
            <Route
              path="/settings/team"
              element={
                <ProtectedApp>
                  <TeamSettingsPage />
                </ProtectedApp>
              }
            />
            <Route
              path="/settings/extension"
              element={
                <ProtectedApp>
                  <ExtensionSettingsPage />
                </ProtectedApp>
              }
            />

            {/* Root redirect */}
            <Route path="/" element={<Navigate to="/snippets" replace />} />

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
