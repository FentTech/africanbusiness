import "./global.css";

import { Component, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import OwnerOrders from "./pages/OwnerOrders";
import Checkout from "./pages/Checkout";
import TrackOrder from "./pages/TrackOrder";
import AdminDashboard from "./pages/AdminDashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("Storefront render failed", error);
  }

  render() {
    if (this.state.hasError) {
      return <main className="grid min-h-screen place-items-center bg-[#f7f8fc] px-6 text-center text-[#1d2942]"><div><h1 className="font-serif text-3xl font-bold">Akwaaba Goods</h1><p className="mt-3 text-sm">The page could not load. Please refresh to try again.</p><button onClick={() => window.location.reload()} className="mt-5 rounded-full bg-[#4163e8] px-5 py-3 text-sm font-bold text-white">Refresh page</button></div></main>;
    }
    return this.props.children;
  }
}

const App = () => (
  <AppErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/owner/orders" element={<OwnerOrders />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/track-order" element={<TrackOrder />} />
          <Route path="/admin" element={<AdminDashboard />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </AppErrorBoundary>
);

createRoot(document.getElementById("root")!).render(<App />);
