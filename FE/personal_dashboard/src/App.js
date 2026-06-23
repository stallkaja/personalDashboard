import { BrowserRouter, Routes, Route } from "react-router-dom";

import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";
import ReminderBanner from "./components/ReminderBanner";
import ErrorBoundary from "./components/ErrorBoundary";

import Dashboard from "./pages/Dashboard";
import Accounts from "./pages/Accounts";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import Register from "./pages/Register";
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
import MyStuff from "./pages/MyStuff";

function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <BrowserRouter>
        <ErrorBoundary>
        <Navbar />
        <ReminderBanner />

        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route
            path="/change-password"
            element={
              <ProtectedRoute>
                <ChangePassword />
              </ProtectedRoute>
            }
          />

          <Route
            path="/my-stuff"
            element={
              <ProtectedRoute>
                <MyStuff />
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
              <ProtectedRoute>
                <VideoLibrary />
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
        </Routes>
        </ErrorBoundary>
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
