import { RouterProvider } from 'react-router';
import { router } from './routes';
import { ThemeProvider } from './contexts/ThemeContext';
import { DemoModeProvider } from './contexts/DemoModeContext';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Toaster } from 'sonner';

export default function App() {
  return (
    <ThemeProvider>
      <DemoModeProvider>
        <DndProvider backend={HTML5Backend}>
          <RouterProvider router={router} />
          <Toaster position="top-right" richColors closeButton />
        </DndProvider>
      </DemoModeProvider>
    </ThemeProvider>
  );
}