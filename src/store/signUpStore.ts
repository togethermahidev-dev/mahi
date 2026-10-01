import { create } from 'zustand';

interface SignUpFormState {
  // View 1
  email: string;
  password: string;
  // View 3
  firstName: string;
  lastName: string;
  dobDD: string;
  dobMM: string;
  dobYYYY: string;
  contactNumber: string;
  // View 4
  username: string;
  displayName: string;
  fitnessGoals: string[];
  fitnessRoutine: string[]; // days of week, joined to text on DB insert
  // Actions
  setField: <
    K extends keyof Omit<SignUpFormState, 'setField' | 'toggleGoal' | 'toggleRoutineDay' | 'reset'>,
  >(
    key: K,
    val: SignUpFormState[K]
  ) => void;
  toggleGoal: (goal: string) => void;
  toggleRoutineDay: (day: string) => void;
  reset: () => void;
}

const initialState = {
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  dobDD: '',
  dobMM: '',
  dobYYYY: '',
  contactNumber: '',
  username: '',
  displayName: '',
  fitnessGoals: [] as string[],
  fitnessRoutine: [] as string[],
};

export const useSignUpStore = create<SignUpFormState>((set) => ({
  ...initialState,
  setField: (key, val) => set({ [key]: val } as Partial<SignUpFormState>),
  toggleGoal: (goal) =>
    set((state) => ({
      fitnessGoals: state.fitnessGoals.includes(goal)
        ? state.fitnessGoals.filter((g) => g !== goal)
        : [...state.fitnessGoals, goal],
    })),
  toggleRoutineDay: (day) =>
    set((state) => ({
      fitnessRoutine: state.fitnessRoutine.includes(day)
        ? state.fitnessRoutine.filter((d) => d !== day)
        : [...state.fitnessRoutine, day],
    })),
  reset: () => set(initialState),
}));
