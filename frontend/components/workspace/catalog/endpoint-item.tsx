'use client';
import { Collapsible } from 'radix-ui';
import { CaretDown } from '@phosphor-icons/react';
import { Tag } from '../ui';
import type { ToolEndpoint } from './kivel-tools';
import styles from './endpoint-item.module.css';

/** One callable tool: label and id, expanding to its inputs. */
export function EndpointItem({
    endpoint,
    open,
    onOpenChange,
}: {
    endpoint: ToolEndpoint;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    return (
        <Collapsible.Root open={open} onOpenChange={onOpenChange} className={styles.item}>
            <Collapsible.Trigger className={styles.trigger}>
                <span className={styles.title}>
                    <b>{endpoint.label}</b>
                    <code>{endpoint.id}</code>
                </span>
                <span className={styles.cost}>Included</span>
                <CaretDown className={styles.caret} size={12} weight="bold" aria-hidden="true" />
            </Collapsible.Trigger>
            <Collapsible.Content className={styles.content}>
                <div className={styles.inner}>
                    <p>{endpoint.summary}</p>
                    {endpoint.inputs.length > 0 ? (
                        <table className={styles.inputs}>
                            <thead>
                                <tr>
                                    <th scope="col">Input</th>
                                    <th scope="col">Type</th>
                                    <th scope="col">
                                        <span className="sr-only">Required</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {endpoint.inputs.map((input) => (
                                    <tr key={input.name}>
                                        <td>
                                            <code>{input.name}</code>
                                            <small>{input.description}</small>
                                        </td>
                                        <td>{input.type}</td>
                                        <td>{input.required && <Tag tone="warn">Required</Tag>}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <p className={styles.none}>No inputs.</p>
                    )}
                </div>
            </Collapsible.Content>
        </Collapsible.Root>
    );
}
