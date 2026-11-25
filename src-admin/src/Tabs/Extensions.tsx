import React, { Component } from 'react';

import {
    Checkbox,
    FormControl,
    FormControlLabel,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';

import { I18n, type AdminConnection } from '@iobroker/gui-components';

import type { WebAdapterConfig } from '../types';

/** Kinds of a WebTransport channel (RFC-009 §5) */
export type LaneKind = 'rpc' | 'events' | 'alarm' | 'normal' | 'bulk' | 'telemetry' | 'isolated' | 'tunnel';

/** What one extension uses (stored in `native.extensionProfiles[instance]`) */
export interface ExtensionProfile {
    /** `auto`: WebTransport when the browser can, else WebSocket; `websocket`: always the old way */
    transport: 'auto' | 'websocket' | 'webtransport';
    channels: Record<string, { lane: LaneKind; priority: number }>;
}

/** A channel an extension declares in `common.webChannels` of its io-package */
interface DeclaredChannel {
    name: string;
    kinds: LaneKind[];
    default?: LaneKind;
    priority?: number;
}

interface ExtensionRow {
    instance: string;
    adapter: string;
    enabled: boolean;
    /** JS file of `common.webExtension`, or `native` for a Rust extension */
    kind: 'js' | 'native';
    channels: DeclaredChannel[];
}

/** The lane choices shown for each channel; kinds the extension does not allow are shown disabled */
const ALL_KINDS: { kind: LaneKind; label: string; hint: string }[] = [
    { kind: 'normal', label: 'ext_lane_normal', hint: 'ext_lane_normal_hint' },
    { kind: 'alarm', label: 'ext_lane_alarm', hint: 'ext_lane_alarm_hint' },
    { kind: 'bulk', label: 'ext_lane_bulk', hint: 'ext_lane_bulk_hint' },
    { kind: 'telemetry', label: 'ext_lane_telemetry', hint: 'ext_lane_telemetry_hint' },
    { kind: 'isolated', label: 'ext_lane_isolated', hint: 'ext_lane_isolated_hint' },
    { kind: 'rpc', label: 'ext_lane_rpc', hint: 'ext_lane_rpc_hint' },
    { kind: 'tunnel', label: 'ext_lane_tunnel', hint: 'ext_lane_tunnel_hint' },
];

/** A JS extension of the old kind speaks HTTP/WebSocket: it can only be carried whole, in a stream of its own */
const LEGACY_CHANNELS: DeclaredChannel[] = [{ name: 'default', kinds: ['tunnel'], default: 'tunnel', priority: 3 }];

interface ExtensionsProps {
    native: WebAdapterConfig;
    socket: AdminConnection;
    instance: number;
    onChange: (attr: string, value: any, cb?: () => void) => void;
}

interface ExtensionsState {
    rows: ExtensionRow[] | null;
    error: string;
}

export default class Extensions extends Component<ExtensionsProps, ExtensionsState> {
    constructor(props: ExtensionsProps) {
        super(props);
        this.state = { rows: null, error: '' };
    }

    async componentDidMount(): Promise<void> {
        try {
            const instances = await this.props.socket.getAdapterInstances();
            const own = `web.${this.props.instance}`;
            const rows: ExtensionRow[] = [];
            for (const obj of instances) {
                const common = obj.common as ioBroker.InstanceCommon & { webChannels?: DeclaredChannel[] };
                const webInstance = (obj.native as { webInstance?: string } | undefined)?.webInstance;
                if (!common?.webExtension || (webInstance !== own && webInstance !== '*')) {
                    continue;
                }
                const nativeExt = typeof common.webExtension === 'object';
                const declared = Array.isArray(common.webChannels) && common.webChannels.length ? common.webChannels : null;
                rows.push({
                    instance: obj._id.replace(/^system\.adapter\./, ''),
                    adapter: common.name,
                    enabled: !!common.enabled,
                    kind: nativeExt ? 'native' : 'js',
                    channels: declared || LEGACY_CHANNELS,
                });
            }
            rows.sort((a, b) => a.instance.localeCompare(b.instance));
            this.setState({ rows });
        } catch (e) {
            this.setState({ rows: [], error: String(e) });
        }
    }

    private profileOf(row: ExtensionRow): ExtensionProfile {
        const stored = (this.props.native.extensionProfiles || {})[row.instance] as ExtensionProfile | undefined;
        const channels: ExtensionProfile['channels'] = {};
        for (const ch of row.channels) {
            const s = stored?.channels?.[ch.name];
            const lane = s && ch.kinds.includes(s.lane) ? s.lane : ch.default || ch.kinds[0];
            channels[ch.name] = { lane, priority: s?.priority ?? ch.priority ?? 3 };
        }
        return { transport: stored?.transport || 'auto', channels };
    }

    private setProfile(row: ExtensionRow, profile: ExtensionProfile): void {
        const all = { ...(this.props.native.extensionProfiles || {}) };
        all[row.instance] = profile;
        this.props.onChange('extensionProfiles', all);
    }

    renderTransport(): React.JSX.Element {
        const { native, onChange } = this.props;
        return (
            <Paper style={{ padding: 16, width: '100%', boxSizing: 'border-box' }}>
                <Typography variant="h6">{I18n.t('ext_transport')}</Typography>
                <FormControlLabel
                    control={
                        <Checkbox
                            checked={!!native.wtEnabled}
                            onChange={() => onChange('wtEnabled', !native.wtEnabled)}
                        />
                    }
                    label={I18n.t('ext_wt_enabled')}
                />
                <Typography
                    variant="body2"
                    color="textSecondary"
                >
                    {I18n.t('ext_wt_enabled_hint')}
                </Typography>
                {native.wtEnabled ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 16 }}>
                        <FormControl
                            variant="standard"
                            style={{ minWidth: 260 }}
                        >
                            <InputLabel>{I18n.t('ext_wt_tls')}</InputLabel>
                            <Select
                                value={native.wtTls || 'pinned'}
                                onChange={e => onChange('wtTls', e.target.value)}
                            >
                                <MenuItem value="pinned">{I18n.t('ext_wt_tls_pinned')}</MenuItem>
                                <MenuItem value="ca">{I18n.t('ext_wt_tls_ca')}</MenuItem>
                                <MenuItem value="insecure">{I18n.t('ext_wt_tls_insecure')}</MenuItem>
                            </Select>
                        </FormControl>
                        <TextField
                            variant="standard"
                            type="number"
                            label={I18n.t('ext_wt_port')}
                            helperText={I18n.t('ext_wt_port_hint')}
                            value={native.wtPort || 0}
                            onChange={e => onChange('wtPort', parseInt(e.target.value, 10) || 0)}
                        />
                        <TextField
                            variant="standard"
                            label={I18n.t('ext_wt_hostnames')}
                            helperText={I18n.t('ext_wt_hostnames_hint')}
                            value={native.wtHostnames || ''}
                            onChange={e => onChange('wtHostnames', e.target.value)}
                        />
                        <TextField
                            variant="standard"
                            type="number"
                            label={I18n.t('ext_wt_rpc_streams')}
                            value={native.wtMaxRpcStreams || 2000}
                            onChange={e => onChange('wtMaxRpcStreams', parseInt(e.target.value, 10) || 2000)}
                        />
                    </div>
                ) : null}
                {native.wtEnabled && native.wtTls === 'insecure' ? (
                    <Typography
                        color="error"
                        style={{ marginTop: 8 }}
                    >
                        {I18n.t('ext_wt_tls_insecure_warning')}
                    </Typography>
                ) : null}
            </Paper>
        );
    }

    renderRow(row: ExtensionRow): React.JSX.Element[] {
        const profile = this.profileOf(row);
        const wtOff = !this.props.native.wtEnabled || profile.transport === 'websocket';
        return row.channels.map((ch, i) => (
            <TableRow key={`${row.instance}/${ch.name}`}>
                {i === 0 ? (
                    <>
                        <TableCell rowSpan={row.channels.length}>
                            <b>{row.instance}</b>
                            {row.enabled ? null : (
                                <Typography
                                    variant="caption"
                                    color="textSecondary"
                                    component="div"
                                >
                                    {I18n.t('ext_disabled')}
                                </Typography>
                            )}
                        </TableCell>
                        <TableCell rowSpan={row.channels.length}>
                            {I18n.t(row.kind === 'native' ? 'ext_kind_native' : 'ext_kind_js')}
                            {row.channels === LEGACY_CHANNELS ? (
                                <Typography
                                    variant="caption"
                                    color="textSecondary"
                                    component="div"
                                >
                                    {I18n.t('ext_legacy_hint')}
                                </Typography>
                            ) : null}
                        </TableCell>
                        <TableCell rowSpan={row.channels.length}>
                            <Select
                                variant="standard"
                                value={profile.transport}
                                disabled={!this.props.native.wtEnabled}
                                onChange={e =>
                                    this.setProfile(row, {
                                        ...profile,
                                        transport: e.target.value as ExtensionProfile['transport'],
                                    })
                                }
                            >
                                <MenuItem value="auto">{I18n.t('ext_transport_auto')}</MenuItem>
                                <MenuItem value="webtransport">{I18n.t('ext_transport_wt')}</MenuItem>
                                <MenuItem value="websocket">{I18n.t('ext_transport_ws')}</MenuItem>
                            </Select>
                        </TableCell>
                    </>
                ) : null}
                <TableCell>{ch.name}</TableCell>
                <TableCell>
                    <Select
                        variant="standard"
                        value={profile.channels[ch.name].lane}
                        disabled={wtOff}
                        onChange={e =>
                            this.setProfile(row, {
                                ...profile,
                                channels: {
                                    ...profile.channels,
                                    [ch.name]: { ...profile.channels[ch.name], lane: e.target.value as LaneKind },
                                },
                            })
                        }
                    >
                        {ALL_KINDS.map(k => (
                            <MenuItem
                                key={k.kind}
                                value={k.kind}
                                disabled={!ch.kinds.includes(k.kind)}
                            >
                                <Tooltip
                                    title={I18n.t(k.hint)}
                                    placement="right"
                                >
                                    <span>{I18n.t(k.label)}</span>
                                </Tooltip>
                            </MenuItem>
                        ))}
                    </Select>
                </TableCell>
                <TableCell>
                    <Select
                        variant="standard"
                        value={profile.channels[ch.name].priority}
                        disabled={wtOff}
                        onChange={e =>
                            this.setProfile(row, {
                                ...profile,
                                channels: {
                                    ...profile.channels,
                                    [ch.name]: { ...profile.channels[ch.name], priority: Number(e.target.value) },
                                },
                            })
                        }
                    >
                        {[7, 6, 5, 4, 3, 2, 1, 0].map(p => (
                            <MenuItem
                                key={p}
                                value={p}
                            >
                                {p}
                            </MenuItem>
                        ))}
                    </Select>
                </TableCell>
            </TableRow>
        ));
    }

    render(): React.JSX.Element {
        const { rows, error } = this.state;
        return (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {this.renderTransport()}
                <Paper style={{ padding: 16, width: '100%', boxSizing: 'border-box' }}>
                    <Typography variant="h6">{I18n.t('ext_list')}</Typography>
                    <Typography
                        variant="body2"
                        color="textSecondary"
                    >
                        {I18n.t('ext_list_hint')}
                    </Typography>
                    {error ? <Typography color="error">{error}</Typography> : null}
                    {rows && !rows.length ? <Typography style={{ marginTop: 16 }}>{I18n.t('ext_none')}</Typography> : null}
                    {rows?.length ? (
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>{I18n.t('ext_col_instance')}</TableCell>
                                    <TableCell>{I18n.t('ext_col_kind')}</TableCell>
                                    <TableCell>{I18n.t('ext_col_transport')}</TableCell>
                                    <TableCell>{I18n.t('ext_col_channel')}</TableCell>
                                    <TableCell>{I18n.t('ext_col_lane')}</TableCell>
                                    <TableCell>{I18n.t('ext_col_priority')}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>{rows.flatMap(r => this.renderRow(r))}</TableBody>
                        </Table>
                    ) : null}
                </Paper>
            </div>
        );
    }
}
