import { BrowserRouter, Routes, Route } from "react-router-dom";

import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import Navbar from "./components/Navbar";
import Header from "./components/Header";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";
import VideoRoute from "./components/VideoRoute";
import ReminderBanner from "./components/ReminderBanner";
import AnnouncementBanner from "./components/AnnouncementBanner";
import AccentApplier from "./components/AccentApplier";
import ErrorBoundary from "./components/ErrorBoundary";
import useIsMobile from "./hooks/useIsMobile";
import { colors } from "./styles/theme";

import Dashboard from "./pages/Dashboard";
import Accounts from "./pages/Accounts";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ChangePassword from "./pages/ChangePassword";
import WeatherCenter from "./pages/WeatherCenter";
import ForecastDay from "./pages/ForecastDay";
import Admin from "./pages/Admin";
import Calendar from "./pages/Calendar";
import CalendarDay from "./pages/CalendarDay";
import Chores from "./pages/Chores";
import ChoreDay from "./pages/ChoreDay";
import MealPlanner from "./pages/MealPlanner";
import MealDay from "./pages/MealDay";
import PlanMeals from "./pages/PlanMeals";
import News from "./pages/News";
import ShoppingList from "./pages/ShoppingList";
import PhotoGallery from "./pages/PhotoGallery";
import VideoLibrary from "./pages/VideoLibrary";
import Communication from "./pages/Communication";
import VideoCall from "./pages/VideoCall";
import DatabaseManager from "./pages/DatabaseManager";

function AppShell() {
  const isMobile = useIsMobile();

  return (
    <div style={{ display: isMobile ? "block" : "flex", minHeight: "100vh", background: colors.background }}>
      <Navbar />

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <Header />
        <AnnouncementBanner />
        <ReminderBanner />

        <div style={{ flex: 1, minWidth: 0 }}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            <Route
              path="/change-password"
              element={
                <ProtectedRoute>
                  <ChangePassword />
                </ProtectedRoute>
              }
            />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/news"
              element={
                <ProtectedRoute>
                  <News />
                </ProtectedRoute>
              }
            />

            <Route
              path="/weather-center"
              element={
                <ProtectedRoute>
                  <WeatherCenter />
                </ProtectedRoute>
              }
            />

            <Route
              path="/forecast/:date"
              element={
                <ProtectedRoute>
                  <ForecastDay />
                </ProtectedRoute>
              }
            />

            <Route
              path="/calendar"
              element={
                <ProtectedRoute>
                  <Calendar />
                </ProtectedRoute>
              }
            />

            <Route
              path="/calendar/:date"
              element={
                <ProtectedRoute>
                  <CalendarDay />
                </ProtectedRoute>
              }
            />

            <Route
              path="/chores"
              element={
                <ProtectedRoute>
                  <Chores />
                </ProtectedRoute>
              }
            />

            <Route
              path="/chores/:date"
              element={
                <ProtectedRoute>
                  <ChoreDay />
                </ProtectedRoute>
              }
            />

            <Route
              path="/meal-planner"
              element={
                <ProtectedRoute>
                  <MealPlanner />
                </ProtectedRoute>
              }
            />

            <Route
              path="/meal-planner/plan"
              element={
                <ProtectedRoute>
                  <PlanMeals />
                </ProtectedRoute>
              }
            />

            <Route
              path="/meal-planner/:date"
              element={
                <ProtectedRoute>
                  <MealDay />
                </ProtectedRoute>
              }
            />

            <Route
              path="/shopping-list"
              element={
                <ProtectedRoute>
                  <ShoppingList />
                </ProtectedRoute>
              }
            />

            <Route
              path="/photo-gallery"
              element={
                <ProtectedRoute>
                  <PhotoGallery />
                </ProtectedRoute>
              }
            />

            <Route
              path="/video-library"
              element={
                <VideoRoute>
                  <VideoLibrary />
                </VideoRoute>
              }
            />

            <Route
              path="/communication"
              element={
                <ProtectedRoute>
                  <Communication />
                </ProtectedRoute>
              }
            />

            <Route
              path="/video-call"
              element={
                <ProtectedRoute>
                  <VideoCall />
                </ProtectedRoute>
              }
            />

            <Route
              path="/accounts"
              element={
                <ProtectedRoute>
                  <Accounts />
                </ProtectedRoute>
              }
            />

            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <Admin />
                </AdminRoute>
              }
            />

            <Route
              path="/admin/database"
              element={
                <AdminRoute>
                  <DatabaseManager />
                </AdminRoute>
              }
            />
          </Routes>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <ErrorBoundary>
            <AccentApplier />
            <AppShell />
          </ErrorBoundary>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
