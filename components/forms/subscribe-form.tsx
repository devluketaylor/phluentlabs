"use client";

import type { ReactNode } from "react";
import * as React from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";

type Step<T extends FieldValues> = {
    name: string;
    children: ReactNode;
    fields?: Path<T>[];
};

type ControlsRenderProps<T extends FieldValues> = {
    currentStep: number;
    isFirstStep: boolean;
    isLastStep: boolean;
    back: () => void;
    next: () => Promise<void>;
    submit: () => void;
    methods: UseFormReturn<T>;
};

type MultiStepFormProps<T extends FieldValues> = {
    methods: UseFormReturn<T>;
    steps: Step<T>[];
    controls?: (props: ControlsRenderProps<T>) => ReactNode;
    onSubmit: (data: T) => void | Promise<void>;
    className?: string;
};

export function SubscribeForm<T extends FieldValues>({
    methods,
    steps,
    controls,
    onSubmit,
    className,
}: MultiStepFormProps<T>) {
    const [currentStep, setCurrentStep] = React.useState(0);

    const isFirstStep = currentStep === 0;
    const isLastStep = currentStep === steps.length - 1;

    const back = () => setCurrentStep((s) => Math.max(0, s - 1));

    const next = async () => {
        if (isLastStep) return;
        const step = steps[currentStep];
        const ok = step.fields?.length
            ? await methods.trigger(step.fields, { shouldFocus: true })
            : await methods.trigger(undefined, { shouldFocus: true });
        if (!ok) return;
        setCurrentStep((s) => Math.min(steps.length - 1, s + 1));
    };

    const submit = () => {
        void methods.handleSubmit(onSubmit)();
    };

    return (
        <form
            className={className ?? "w-full"}
            onSubmit={(e) => e.preventDefault()}
        >
            <div>{steps[currentStep]?.children}</div>

            <div className="mt-6">
                {controls ? (
                    controls({ currentStep, isFirstStep, isLastStep, back, next, submit, methods })
                ) : (
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={back}
                            disabled={isFirstStep}
                            className="px-4 py-2 rounded border"
                        >
                            Back
                        </button>
                        {!isLastStep ? (
                            <button type="button" onClick={next} className="px-4 py-2 rounded border">
                                Next
                            </button>
                        ) : (
                            <button type="button" onClick={submit} className="px-4 py-2 rounded border">
                                Subscribe
                            </button>
                        )}
                    </div>
                )}
            </div>
        </form>
    );
}
