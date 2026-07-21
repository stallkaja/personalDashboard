import { BrowserRouter, Routes, Route } from "react-router-dom";

import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";
import VideoRoute from "./components/VideoRoute";
import ReminderBanner from "./components/ReminderBanner";
import AnnouncementBanner from "./components/AnnouncementBanner";
import AccentApplier from "./components/AccentApplier";
import ErrorBoundary from "./components/ErrorBoundary";

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
import ShoppingList from "./pages/ShoppingList";
import PhotoGallery from "./pages/PhotoGallery";
import VideoLibrary from "./pages/VideoLibrary";
import Career from "./pages/Career";
import Communication from "./pages/Communication";
import VideoCall from "./pages/VideoCall";
import DatabaseManager from "./pages/DatabaseManager";

function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <BrowserRouter>
        <ErrorBoundary>
        <AccentApplier />
        <Navbar />
        <AnnouncementBanner />
        <ReminderBanner />

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
            path="/career"
            element={
              <ProtectedRoute>
                <Career />
              </ProtectedRoute>
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
        </ErrorBoundary>
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
