// One day, chosen from a calendar. beary's, copied as it is there.
//
// The value travels as a plain YYYY-MM-DD, which is what the filters and the
// card rows already hold and what the API expects. The day is shown the way
// the person reads dates everywhere else on the site, which a field of typed
// segments could never do, so it is a button that opens the calendar, and a
// cross beside it to say "no day" again.

import { Calendar as CalendarIcon, Xmark } from "@gravity-ui/icons";
import { Button, Calendar, Label, Popover } from "@heroui/react";
import { parseDate } from "@internationalized/date";
import { useState } from "react";
import { I18nProvider } from "react-aria-components";
import { formatDate, type Preferences } from "../format";

/** The calendar's month and day names, in the person's own language. */
function locale(language: string): string {
  return language === "en" ? "en-GB" : language;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function DayPicker({
  className,
  label,
  labelClassName,
  onChange,
  person,
  value,
}: {
  className?: string;
  label: string;
  /** The filter bar writes its labels small; a form leaves this alone. */
  labelClassName?: string;
  onChange: (day: string) => void;
  person: Preferences;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const day = DAY.test(value) ? value : "";

  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <Label className={labelClassName}>{label}</Label>
      <div className="flex items-center gap-1">
        <Popover isOpen={open} onOpenChange={setOpen}>
          {/* A button that opens the calendar, dressed as the fields beside it:
              their background, their corners, their text. It holds a value,
              so it should look like somewhere a value goes. */}
          <Button
            aria-label={label}
            className="text-foreground flex-1 justify-start rounded-[var(--field-radius,calc(var(--radius)*1.5))] bg-[var(--default)] data-[hovered=true]:bg-[var(--default-hover)] px-3 font-normal"
            variant="secondary"
          >
            <CalendarIcon
              aria-hidden
              className="text-muted mr-2 size-4 shrink-0"
            />
            {day ? (
              formatDate(day, person)
            ) : (
              <span className="text-muted">any day</span>
            )}
          </Button>
          <Popover.Content>
            <Popover.Dialog>
              <I18nProvider locale={locale(person.language)}>
                <Calendar
                  aria-label={label}
                  onChange={(next) => {
                    onChange(next.toString());
                    setOpen(false);
                  }}
                  value={day ? parseDate(day) : null}
                >
                  <Calendar.Header>
                    <Calendar.YearPickerTrigger>
                      <Calendar.YearPickerTriggerHeading />
                      <Calendar.YearPickerTriggerIndicator />
                    </Calendar.YearPickerTrigger>
                    <Calendar.NavButton slot="previous" />
                    <Calendar.NavButton slot="next" />
                  </Calendar.Header>
                  <Calendar.Grid>
                    <Calendar.GridHeader>
                      {(weekday) => (
                        <Calendar.HeaderCell>{weekday}</Calendar.HeaderCell>
                      )}
                    </Calendar.GridHeader>
                    <Calendar.GridBody>
                      {(date) => <Calendar.Cell date={date} />}
                    </Calendar.GridBody>
                  </Calendar.Grid>
                  <Calendar.YearPickerGrid>
                    <Calendar.YearPickerGridBody>
                      {({ year }) => <Calendar.YearPickerCell year={year} />}
                    </Calendar.YearPickerGridBody>
                  </Calendar.YearPickerGrid>
                </Calendar>
              </I18nProvider>
            </Popover.Dialog>
          </Popover.Content>
        </Popover>
        {day ? (
          <Button
            aria-label={`No ${label.toLowerCase()} day`}
            isIconOnly
            onPress={() => onChange("")}
            variant="secondary"
          >
            <Xmark className="size-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
