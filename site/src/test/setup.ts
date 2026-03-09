import "@testing-library/jest-dom/vitest";

Object.defineProperty(window, "print", {
	writable: true,
	value: () => {},
});
