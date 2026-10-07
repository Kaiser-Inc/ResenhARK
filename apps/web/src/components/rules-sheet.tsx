"use client";

import { GameRules } from "@/components/game-rules";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { GAME_RULES, type RulesSetup } from "@/lib/game-rules";
import { BookOpenIcon, XIcon } from "lucide-react";

export function RulesSheet({ setup }: { setup: RulesSetup }) {
  return (
    <Sheet>
      <SheetTrigger render={<Button type="button" variant="outline" />}>
        <BookOpenIcon aria-hidden="true" strokeWidth={1.75} />
        Regras
      </SheetTrigger>
      <SheetContent showCloseButton={false}>
        <SheetHeader>
          <SheetTitle>Regras</SheetTitle>
          <SheetDescription>Como jogar {GAME_RULES[setup.type].name}</SheetDescription>
        </SheetHeader>
        <GameRules game={setup.type} setup={setup} />
        <SheetClose
          render={<Button variant="ghost" size="icon" className="absolute top-4 right-4" />}
          aria-label="Fechar"
        >
          <XIcon aria-hidden="true" strokeWidth={1.75} />
        </SheetClose>
      </SheetContent>
    </Sheet>
  );
}
